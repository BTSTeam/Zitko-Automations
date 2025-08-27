// app/api/match/run/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

type RunReq = {
  jobId?: string
  job?: {
    title?: string
    location?: string
    skills?: string[]
    qualifications?: string[]
    description?: string
  }
  page?: number
  limit?: number
  debug?: boolean
}

// ---------- helpers ----------
function esc(s?: string) { return (s ?? '').replace(/"/g, '\\"').trim() }

// exact phrase -> field:"value"#
function term(field: string, value?: string) {
  const v = esc(value); return v ? `${field}:"${v}"#` : ''
}

// phrase across fields -> (f1:"v"# OR f2:"v"#)
function termFields(fields: string[], value?: string) {
  const v = esc(value); if (!v) return ''
  return `(${fields.map(f => `${f}:"${v}"#`).join(' OR ')})`
}

// split into useful tokens
function splitTokens(v?: string) {
  if (!v) return [] as string[]
  const stop = new Set(['&','and','of','the','/','-','|',','])
  return v.split(/[,\s/|\-]+/g).map(t => t.trim()).filter(t => t && !stop.has(t.toLowerCase()) && t.length >= 2)
}

// token AND across fields -> (f1:tok1# OR f2:tok1#) AND ...
function tokensANDFields(fields: string[], value?: string) {
  const toks = splitTokens(value); if (!toks.length) return ''
  return toks.map(tok => `(${fields.map(f => `${f}:${esc(tok)}#`).join(' OR ')})`).join(' AND ')
}

// token OR across fields -> (f1:tok1# OR f2:tok1# OR f1:tok2# OR ...)
function tokensORFields(fields: string[], value?: string) {
  const toks = splitTokens(value); if (!toks.length) return ''
  const bits: string[] = []
  for (const tok of toks) for (const f of fields) bits.push(`${f}:${esc(tok)}#`)
  return `(${bits.join(' OR ')})`
}

// phrase OR token-AND across fields
function phraseOrTokens(fields: string[], value?: string) {
  const p = termFields(fields, value)
  const t = tokensANDFields(fields, value)
  return p && t ? `(${p} OR ${t})` : (p || t)
}

// any of values across fields -> (f1:"a"# OR f2:"a"# OR f1:"b"# ...)
function anyValuesFields(fields: string[], items: string[]) {
  const list = (items || []).map(esc).filter(Boolean)
  if (!list.length) return ''
  const bits: string[] = []
  for (const f of fields) for (const v of list) bits.push(`${f}:"${v}"#`)
  return `(${bits.join(' OR ')})`
}

function onlyUnique<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>(), out: T[] = []
  for (const it of arr) { const k = key(it); if (!k || seen.has(k)) continue; seen.add(k); out.push(it) }
  return out
}

function findLinkedIn(d: any): string | null {
  const fields = [d.linkedin, d.linkedIn, d.linkedin_url, d.linkedinUrl, d.urls?.linkedin, d.social?.linkedin]
  for (const v of fields) if (typeof v === 'string' && v.includes('linkedin.com')) return v
  return null
}

// Title helpers
const TITLE_FIELDS = ['current_job_title', 'job_title']
const titleExactCurrent = (t?: string) => term('current_job_title', t)
const titleBroad = (t?: string) => phraseOrTokens(TITLE_FIELDS, t)

// ---------- route ----------
export async function POST(req: NextRequest) {
  requiredEnv()
  const body = (await req.json().catch(() => ({}))) as RunReq
  const page = Math.max(1, Number(body.page ?? 1))
  const pageSize = Math.min(Math.max(Number(body.limit ?? 20), 1), 50)
  const debug = !!body.debug

  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // Resolve job by id if needed
  let job = body.job
  if (!job && body.jobId) {
    const call = async () =>
      fetch(positionUrl(body.jobId!), { headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY }, cache: 'no-store' })
    let r = await call()
    if (r.status === 401 || r.status === 403) {
      if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
        const s2 = await getSession(); idToken = s2.tokens?.idToken; r = await call()
      }
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return NextResponse.json({ error: 'Failed to load position', detail }, { status: r.status || 400 })
    }
    const pos = await r.json()
    job = {
      title: pos.job_title || pos.title || pos.name || '',
      location: pos['location-text'] || pos.location_text || pos.location || pos.city || '',
      skills: Array.isArray(pos.skills) ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean)
            : typeof pos.keywords === 'string' ? pos.keywords.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      description: String(pos.public_description || pos.publicDescription || pos.description || ''),
    }
  }
  if (!job) return NextResponse.json({ error: 'Missing job' }, { status: 400 })

  const title = String(job.title || '').trim()
  const locationRaw = String(job.location || '').trim()
  const skills = Array.isArray(job.skills) ? job.skills.map(String) : []
  const qualifications = Array.isArray(job.qualifications) ? job.qualifications.map(String) : []
  const description = String(job.description || '')

  if (!title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  // Use the first part before comma as the city phrase (e.g., "South West London, UK" -> "South West London")
  const cityPhrase = locationRaw.split(',')[0]?.trim() || locationRaw

  // Location — broadened:
  // tokens OR across common location fields, so "South West London" matches if *any* token appears.
  const LOC_FIELDS_BROAD = ['current_location_name', 'current_city', 'current_state', 'current_address']
  const locBroad = tokensORFields(LOC_FIELDS_BROAD, cityPhrase) || term('current_city', cityPhrase)

  // Skills — use skill OR keyword
  const skillsTop3 = skills.slice(0, 3)
  const skillOrKeywordTop3 = anyValuesFields(['skill','keyword'], skillsTop3)
  const skillOrKeywordAny  = anyValuesFields(['skill','keyword'], skills)

  // Build the three searches
  const STRATS: { label: string, q: string }[] = [
    // 1) exact current_job_title + BROAD location + any 1 of top 3 skills
    { label: 'S1', q: [titleExactCurrent(title), locBroad, skillOrKeywordTop3].filter(Boolean).join(' AND ') },
    // 2) broader title + BROAD location + any 1 highlighted skill
    { label: 'S2', q: [titleBroad(title),          locBroad, skillOrKeywordAny ].filter(Boolean).join(' AND ') },
    // 3) broader title + BROAD location (no skills)
    { label: 'S3', q: [titleBroad(title),          locBroad                    ].filter(Boolean).join(' AND ') },
  ].map(s => ({ ...s, q: s.q || '*:*' }))

  // matrix_vars — includes linkedin as requested
  const fl = 'id,first_name,last_name,current_city,current_job_title,skill,linkedin'

  // fetch with retry
  const headersBase = () => ({ 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY })
  const fetchWithRetry = async (url: string) => {
    let resp = await fetch(url, { headers: headersBase(), cache: 'no-store' })
    if (resp.status === 401 || resp.status === 403) {
      if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
        const s2 = await getSession(); idToken = s2.tokens?.idToken
        resp = await fetch(url, { headers: headersBase(), cache: 'no-store' })
      }
    }
    return resp
  }

  // run searches
  const all: any[] = []
  const dbg: any[] = []
  for (const s of STRATS) {
    const matrix = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent('created_date desc')}`
    const limit = Math.min(Math.max(pageSize, 1), 50)
    const url = `${searchBase}/${matrix}?q=${encodeURIComponent(s.q)}&limit=${limit}`
    const resp = await fetchWithRetry(url)
    let docs: any[] = []
    let errorText = ''
    if (resp.ok) {
      const json = await resp.json().catch(() => ({}))
      docs = json?.response?.docs || json?.data || []
      all.push(...docs)
    } else {
      errorText = await resp.text().catch(() => '')
    }
    console.log('[match.run]', s.label, 'q=', s.q, ' status=', resp.status, ' count=', docs.length, errorText ? ` error=${errorText.slice(0,200)}` : '')
    if (debug) dbg.push({ label: s.label, q: s.q, status: resp.status, count: docs.length, sample: docs[0] || null, error: errorText })
  }

  // dedupe + map
  const dedup = onlyUnique(all, (d: any) => String(d.id ?? d.candidate_id ?? ''))
  const candidates = dedup.map((d: any) => ({
    id: String(d.id ?? d.candidate_id ?? ''),
    name: [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.full_name ?? ''),
    location: d.current_city || '',
    currentJobTitle: d.current_job_title || '',
    // skill can be string or array; include keyword too if present
    skills: Array.isArray(d.skill) ? d.skill
          : d.skill ? [d.skill]
          : Array.isArray(d.keyword) ? d.keyword
          : d.keyword ? [d.keyword] : [],
    linkedin: d.linkedin || findLinkedIn(d),
  })).filter(c => c.id)

  // score with AI
  const aiResp = await fetch(new URL('/api/ai/analyze', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job: { title, location: locationRaw, skills, qualifications, description },
      candidates: candidates.map(c => ({ id: c.id, name: c.name, location: c.location, skills: c.skills })),
    }),
  })
  const aiJson = await aiResp.json().catch(() => ({}))
  const aiList: any[] = Array.isArray(aiJson?.results) ? aiJson.results
                    : Array.isArray(aiJson) ? aiJson
                    : (aiJson?.data || [])

  const scoreById = new Map<string, { score: number; reason: string }>()
  for (const r of aiList) {
    const id = String(r.candidate_id ?? r.id ?? r.candidateId ?? '')
    if (!id) continue
    scoreById.set(id, { score: Number(r.score ?? 0), reason: String(r.reason ?? '') })
  }

  const scored = candidates.map(c => ({
    candidateId: c.id,
    candidateName: c.name,
    linkedin: c.linkedin,
    score: scoreById.get(c.id)?.score ?? 0,
    reason: scoreById.get(c.id)?.reason ?? '',
  })).sort((a,b) => b.score - a.score)

  // paginate
  const total = scored.length
  const pageSizeClamped = Math.max(1, Math.min(pageSize, 50))
  const start = (page - 1) * pageSizeClamped
  const results = start < total ? scored.slice(start, start + pageSizeClamped) : []

  return NextResponse.json({ results, total, page, pageSize: pageSizeClamped, ...(debug ? { debug: dbg } : {}) })
}

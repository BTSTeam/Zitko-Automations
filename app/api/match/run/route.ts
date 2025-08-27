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

// exact phrase on a field -> field:"value"#
function term(field: string, value?: string) {
  const v = esc(value); return v ? `${field}:"${v}"#` : ''
}

// multiple fields exact phrase -> (f1:"v"# OR f2:"v"#)
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

// token AND across fields -> (f1:tok1# OR f2:tok1#) AND (f1:tok2# OR f2:tok2#) ...
function tokensANDFields(fields: string[], value?: string) {
  const toks = splitTokens(value); if (!toks.length) return ''
  return toks.map(tok => `(${fields.map(f => `${f}:${esc(tok)}#`).join(' OR ')})`).join(' AND ')
}

// token OR over one field -> (f:tok1# OR f:tok2# ...)
function tokensOR(field: string, value?: string) {
  const toks = splitTokens(value); if (!toks.length) return ''
  return `(${toks.map(tok => `${field}:${esc(tok)}#`).join(' OR ')})`
}

// phrase OR token-AND across fields
function phraseOrTokens(fields: string[], value?: string) {
  const p = termFields(fields, value)
  const t = tokensANDFields(fields, value)
  if (p && t) return `(${p} OR ${t})`
  return p || t
}

// any of values on one field -> (f:"a"# OR f:"b"# ...)
function anyValues(field: string, items: string[]) {
  const list = (items || []).map(esc).filter(Boolean)
  if (!list.length) return ''
  return `(${list.map(v => `${field}:"${v}"#`).join(' OR ')})`
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

  if (!title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  // We’ll use current_city for matching; derive a compact city string from the summary.
  // Example: "South West London, UK" -> "South West London" (then tokenised as needed)
  const cityExact = locationRaw.split(',')[0].trim()

  // --- Build clauses per your spec ---
  // Titles:
  const titleExact = term('current_job_title', title) // exact current_job_title (S1 needs this)
  const titleBroad = phraseOrTokens(['current_job_title', 'job_title'], title) // broader for S2/S3

  // City:
  const cityPhraseExact = term('current_city', cityExact) // exact city (S1/S2)
  const citySlightlyBroad = tokensOR('current_city', cityExact) // slightly broader (S3)

  // Skills:
  const top3 = skills.slice(0, 3)
  const anyOfTop3 = anyValues('skill', top3) // any 1 of the 3 (S1)
  const anySkill = anyValues('skill', skills) // any 1 of all highlighted (S2)

  // Strategies
  const STRATS: { label: string, q: string }[] = [
    // 1) exact current_job_title + exact current_city + any 1 of top 3 skills
    { label: 'S1', q: [titleExact, cityPhraseExact, anyOfTop3].filter(Boolean).join(' AND ') },
    // 2) broader title + exact current_city + any 1 highlighted skill
    { label: 'S2', q: [titleBroad, cityPhraseExact, anySkill].filter(Boolean).join(' AND ') },
    // 3) broader title + slightly broader current_city
    { label: 'S3', q: [titleBroad, citySlightlyBroad].filter(Boolean).join(' AND ') },
  ].map(s => ({ ...s, q: s.q || '*:*' }))

  // matrix vars (your requested return fields; note valid field names)
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
    skills: Array.isArray(d.skill) ? d.skill : (d.skill ? [d.skill] : []),
    linkedin: d.linkedin || findLinkedIn(d),
  })).filter(c => c.id)

  // score with AI
  const aiResp = await fetch(new URL('/api/ai/analyze', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job: { title, location: locationRaw, skills, qualifications: body.job?.qualifications || [], description: body.job?.description || '' },
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

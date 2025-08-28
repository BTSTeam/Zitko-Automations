// Next.js API route for candidate matching and AI scoring.
// Stripped-back: 2 title-only searches (ASC + DESC), dedupe, optional
// location gating, then send to AI for scoring.

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

/* ---------------------------- small helpers ---------------------------- */

function esc(s?: string) {
  return (s ?? '').replace(/"/g, '\\"').trim()
}

function splitTokens(v?: string) {
  if (!v) return [] as string[]
  const stop = new Set(['&', 'and', 'of', 'the', '/', '-', '|'])
  return v
    .split(/[\s,/|\-]+/g)
    .map(t => t.trim())
    .filter(t => t && !stop.has(t.toLowerCase()) && t.length >= 2)
}

// (f1:"Phrase"# OR f2:"Phrase"#)
function phraseFields(fields: string[], value?: string) {
  const v = esc(value)
  if (!v) return ''
  return `(${fields.map(f => `${f}:"${v}"#`).join(' OR ')})`
}

// ( (f1:tok# OR f2:tok#) AND (f1:tok2# OR f2:tok2#) )
function tokensANDFields(fields: string[], value?: string) {
  const toks = splitTokens(value)
  if (!toks.length) return ''
  return toks.map(tok => `(${fields.map(f => `${f}:${esc(tok)}#`).join(' OR ')})`).join(' AND ')
}

// Title clause = OR of phrase(alternatives) and token-AND
function buildTitleClause(title?: string) {
  const fields = ['current_job_title', 'job_title'] // both are valid candidate fields
  const base = (title || '').trim()
  if (!base) return ''

  const alts = new Set<string>([base])
  // remove common seniority noise (keeps both originals and stripped)
  const stripped = base.replace(/\b(Senior|Lead|Principal|Junior|Mid|Midweight|Head|Director)\b/gi, '').replace(/\s+/g, ' ').trim()
  if (stripped && stripped !== base) alts.add(stripped)
  // common synonyms when relevant
  if (/security/i.test(base) && /engineer/i.test(base)) {
    ;[
      'Security Systems Engineer',
      'Fire & Security Engineer',
      'Security Service Engineer',
      'Security Installation Engineer',
      'CCTV Engineer',
      'Access Control Engineer',
    ].forEach(t => alts.add(t))
  }

  const phraseParts = Array.from(alts).map(t => phraseFields(fields, t)).filter(Boolean)
  const tokenPart = tokensANDFields(fields, base)
  const parts = [...phraseParts]
  if (tokenPart) parts.push(tokenPart)
  if (!parts.length) return ''
  return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`
}

function onlyUnique<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>(), out: T[] = []
  for (const it of arr) { const k = key(it); if (!k || seen.has(k)) continue; seen.add(k); out.push(it) }
  return out
}

function findLinkedIn(d: any): string | null {
  const cands = [
    d.linkedin, d.linkedin_url, d.linkedIn, d.linkedinUrl,
    d.social?.linkedin, d.social_links?.linkedin,
    d.urls?.linkedin, d.contacts?.linkedin
  ].filter(Boolean)
  for (const v of cands) if (typeof v === 'string' && v.includes('linkedin.com')) return v
  const arrays = [d.websites, d.links, d.social, d.social_links].filter(Array.isArray)
  for (const arr of arrays as any[]) {
    const hit = arr.find((x: any) => typeof x === 'string' && x.includes('linkedin.com'))
            || arr.find((x: any) => typeof x?.url === 'string' && x.url.includes('linkedin.com'))
    if (hit) return typeof hit === 'string' ? hit : hit.url
  }
  return null
}

// basic, tolerant city gate (keeps if any token from job location appears)
function makeLocationGate(jobLocation?: string) {
  const toks = splitTokens(jobLocation).map(t => t.toLowerCase())
  if (!toks.length) return (_: any) => true
  return (d: any) => {
    const loc = String(d.current_location_name || d.current_city || d.current_address || d.location || '').toLowerCase()
    return toks.some(t => loc.includes(t))
  }
}

/* ------------------------------- handler ------------------------------- */

export async function POST(req: NextRequest) {
  requiredEnv()

  const body = (await req.json().catch(() => ({}))) as RunReq
  const page = Math.max(1, Number(body.page ?? 1))
  const pageSize = Math.min(Math.max(Number(body.limit ?? 20), 1), 50)
  const debug = !!body.debug

  // auth
  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  // endpoints
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // resolve job (by id) if needed
  let job = body.job
  if (!job && body.jobId) {
    const call = async () => fetch(positionUrl(body.jobId!), { headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY }, cache: 'no-store' })
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
    const pos = await r.json().catch(() => ({}))
    job = {
      title: pos.job_title || pos.title || pos.name || '',
      location: pos['location-text'] || pos.location_text || pos.location || pos.city || '',
      skills: Array.isArray(pos.skills)
        ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean)
        : typeof pos.keywords === 'string'
          ? pos.keywords.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [],
      description: String(pos.public_description || pos.publicDescription || pos.description || ''),
    }
  }

  if (!job?.title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  const title = String(job.title || '').trim()
  const location = String(job.location || '').trim()
  const locationGate = makeLocationGate(location)

  const titleClause = buildTitleClause(title)
  const perQueryLimit = 100 // Vincere max per request

  // fields to return (matrix vars `fl=...`)
  const fl = [
    'id',
    'candidate_id',
    'first_name',
    'last_name',
    'current_job_title',
    'current_location_name',
    'current_city',
    'skill',
    'keyword',
    'linkedin',       // user confirmed this field name
    'linkedin_url',   // include as fallback if present in tenant
  ].join(',')

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

  const strategies: { label: string; sort: 'created_date asc' | 'created_date desc'; q: string }[] = [
    { label: 'S1_ASC',  sort: 'created_date asc',  q: titleClause || '*:*' },
    { label: 'S2_DESC', sort: 'created_date desc', q: titleClause || '*:*' },
  ]

  const allDocs: any[] = []
  const dbg: any[] = []

  for (const s of strategies) {
    const matrix = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent(s.sort)}`
    const url = `${searchBase}/${matrix}?q=${encodeURIComponent(s.q)}&limit=${perQueryLimit}`

    const resp = await fetchWithRetry(url)
    let docs: any[] = []
    let err = ''
    if (resp.ok) {
      const json = await resp.json().catch(() => ({}))
      docs = json?.response?.docs || json?.data || []
      // optional gating by location tokens
      docs = docs.filter(locationGate)
      allDocs.push(...docs)
    } else {
      err = await resp.text().catch(() => '')
    }

    console.log('[match.run]', s.label, 'q=', s.q, ' sort=', s.sort, ' status=', resp.status, ' count=', docs.length, err ? ` error=${err.slice(0,200)}` : '')
    if (debug) dbg.push({ label: s.label, q: s.q, sort: s.sort, status: resp.status, count: docs.length, sampleId: docs[0]?.id ?? docs[0]?.candidate_id ?? null, error: err })
  }

  // dedupe (id or candidate_id)
  const dedup = onlyUnique(allDocs, (d: any) => String(d.id ?? d.candidate_id ?? ''))

  // map to compact records
  const candidates = dedup.map((d: any) => {
    const id = String(d.id ?? d.candidate_id ?? '')
    const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.full_name ?? '')
    const loc = d.current_location_name || d.current_city || d.current_address || d.location || ''
    const skillArr: string[] = []
    if (Array.isArray(d.skill)) skillArr.push(...d.skill)
    else if (typeof d.skill === 'string') skillArr.push(d.skill)
    if (Array.isArray(d.keyword)) skillArr.push(...d.keyword)
    else if (typeof d.keyword === 'string') skillArr.push(d.keyword)
    const linkedin = d.linkedin || findLinkedIn(d) || null
    return { id, name, location: String(loc), skills: skillArr.filter(Boolean), linkedin }
  }).filter(c => c.id)

  // send to AI analyzer (kept same payload shape as before)
  const aiResp = await fetch(new URL('/api/ai/analyze', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job: {
        title,
        location,
        skills: Array.isArray(job.skills) ? job.skills : [],
        qualifications: Array.isArray(job.qualifications) ? job.qualifications : [],
        description: String(job.description || ''),
      },
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
  })).sort((a, b) => b.score - a.score)

  // client-side paging of scored list
  const total = scored.length
  const size = Math.max(1, Math.min(pageSize, 50))
  const start = (page - 1) * size
  const results = start < total ? scored.slice(start, start + size) : []

  return NextResponse.json({ results, total, page, pageSize: size, ...(debug ? { debug: dbg } : {}) })
}

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

function splitTokens(v?: string) {
  if (!v) return []
  const stop = new Set(['&','and','of','the','/','-','|',','])
  return v.split(/[,\s/|\-]+/g).map(t => t.trim()).filter(t => t && !stop.has(t.toLowerCase()) && t.length >= 2)
}

// (f1:"v"# OR f2:"v"#)
function termFields(fields: string[], value?: string) {
  const v = esc(value); if (!v) return ''
  return `(${fields.map(f => `${f}:"${v}"#`).join(' OR ')})`
}

// ( (f1:tok1# OR f2:tok1#) AND (f1:tok2# OR f2:tok2#) ...)
function tokensANDFields(fields: string[], value?: string) {
  const toks = splitTokens(value); if (!toks.length) return ''
  return toks.map(tok => `(${fields.map(f => `${f}:${esc(tok)}#`).join(' OR ')})`).join(' AND ')
}

// phrase OR token-AND
function phraseOrTokens(fields: string[], value?: string) {
  const p = termFields(fields, value)
  const t = tokensANDFields(fields, value)
  return p && t ? `(${p} OR ${t})` : (p || t)
}

function onlyUnique<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>(), out: T[] = []
  for (const it of arr) { const k = key(it); if (!k || seen.has(k)) continue; seen.add(k); out.push(it) }
  return out
}

function findLinkedIn(d: any): string | null {
  const vals = [d.linkedin, d.linkedIn, d.linkedin_url, d.linkedinUrl, d.urls?.linkedin, d.social?.linkedin]
  for (const v of vals) if (typeof v === 'string' && v.includes('linkedin.com')) return v
  return null
}

// simple city gate: keep candidate if any job city token appears in candidate city/location_name
function cityMatches(candidate: any, jobLoc?: string): boolean {
  const jl = (jobLoc || '').toLowerCase().trim()
  if (!jl) return true
  const cityTokens = splitTokens(jl)
  if (!cityTokens.length) return true
  const candCity = String(candidate.current_city || '').toLowerCase()
  const candLocName = String(candidate.current_location_name || '').toLowerCase()
  return cityTokens.some(tok => candCity.includes(tok) || candLocName.includes(tok))
}

// ---------- route ----------
export async function POST(req: NextRequest) {
  requiredEnv()
  const body = (await req.json().catch(() => ({}))) as RunReq
  const page = Math.max(1, Number(body.page ?? 1))
  const pageSize = Math.min(Math.max(Number(body.limit ?? 20), 1), 50) // UI pagination only
  const debug = !!body.debug

  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // Resolve job if only jobId provided
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
      qualifications: [],
    }
  }
  if (!job) return NextResponse.json({ error: 'Missing job' }, { status: 400 })

  const title = String(job.title || '').trim()
  const location = String(job.location || '').trim()
  const skills = Array.isArray(job.skills) ? job.skills.map(String) : []
  const qualifications = Array.isArray(job.qualifications) ? job.qualifications.map(String) : []
  const description = String(job.description || '')
  if (!title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  // Title-only (broader) clause across current_job_title + job_title
  const TITLE_FIELDS = ['current_job_title', 'job_title']
  const qTitle = phraseOrTokens(TITLE_FIELDS, title) // broader by design

  // Field list (matrix vars) – include location fields
  const fl = [
    'id',
    'candidate_id',
    'first_name',
    'last_name',
    'current_job_title',
    'current_city',
    'current_location_name',
    'linkedin',
  ].join(',')

  // GET with retry helper
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

  // Two searches: created_date asc and desc, limit 100 each
  const searches = [
    { label: 'S1_ASC', sort: 'created_date asc', limit: 100 },
    { label: 'S2_DESC', sort: 'created_date desc', limit: 100 },
  ]

  const all: any[] = []
  const dbg: any[] = []
  for (const s of searches) {
    const matrix = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent(s.sort)}`
    const url = `${searchBase}/${matrix}?q=${encodeURIComponent(qTitle)}&limit=${s.limit}`
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
    console.log('[match.run]', s.label, 'q=', qTitle, ' sort=', s.sort, ' status=', resp.status, ' count=', docs.length, errorText ? ` error=${errorText.slice(0,200)}` : '')
    if (debug) dbg.push({ label: s.label, sort: s.sort, q: qTitle, status: resp.status, count: docs.length, sample: docs[0] || null, error: errorText })
  }

  // location gate (drop far-away candidates if job has a city)
  const gated = all.filter(d => cityMatches(d, location))

  // de-dup by id/candidate_id
  const dedup = onlyUnique(gated, (d: any) => String(d.id ?? d.candidate_id ?? ''))

  // map to simplified candidates for AI
  const candidates = dedup.map(d => ({
    id: String(d.id ?? d.candidate_id ?? ''),
    name: [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.full_name ?? ''),
    location: d.current_city || d.current_location_name || '',
    currentJobTitle: d.current_job_title || '',
    skills: [], // title-only search; not fetched
    linkedin: d.linkedin || findLinkedIn(d),
  })).filter(c => c.id)

  // send to AI for suitability scoring against the job
  const aiResp = await fetch(new URL('/api/ai/analyze', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job: { title, location, skills, qualifications, description },
      candidates: candidates.map(c => ({ id: c.id, name: c.name, location: c.location, title: c.currentJobTitle, skills: c.skills })),
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
    location: c.location,
    title: c.currentJobTitle,
    score: scoreById.get(c.id)?.score ?? 0,
    reason: scoreById.get(c.id)?.reason ?? '',
  })).sort((a,b) => b.score - a.score)

  // paginate for the UI
  const total = scored.length
  const pageSizeClamped = Math.max(1, Math.min(pageSize, 50))
  const start = (page - 1) * pageSizeClamped
  const results = start < total ? scored.slice(start, start + pageSizeClamped) : []

  return NextResponse.json({
    results,
    total,
    page,
    pageSize: pageSizeClamped,
    ...(debug ? { debug: dbg } : {}),
  })
}

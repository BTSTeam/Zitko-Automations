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
  job?: { title?: string; location?: string; skills?: string[]; qualifications?: string[]; description?: string }
  page?: number
  limit?: number
  debug?: boolean
}

/* ---------------- helpers ---------------- */

function esc(s?: string) { return (s ?? '').replace(/"/g, '\\"').trim() }
function splitTokens(v?: string) {
  if (!v) return [] as string[]
  const stop = new Set(['&','and','of','the','/','-','|',','])
  return v.split(/[,\s/|\-]+/g).map(t => t.trim()).filter(t => t && !stop.has(t.toLowerCase()) && t.length >= 2)
}
// (f1:"Phrase"# OR f2:"Phrase"#)
function phraseFields(fields: string[], value?: string) {
  const v = esc(value); if (!v) return ''; return `(${fields.map(f => `${f}:"${v}"#`).join(' OR ')})`
}
// ( (f1:tok# OR f2:tok#) AND (f1:tok2# OR f2:tok2#) )
function tokensANDFields(fields: string[], value?: string) {
  const toks = splitTokens(value); if (!toks.length) return ''
  return toks.map(tok => `(${fields.map(f => `${f}:${esc(tok)}#`).join(' OR ')})`).join(' AND ')
}
// Title clause: phrase(current_job_title) OR tokens AND across current_job_title + text
function buildTitleClause(title?: string) {
  const base = (title || '').trim(); if (!base) return ''
  const phrase = phraseFields(['current_job_title'], base)
  const tokenAND = tokensANDFields(['current_job_title','text'], base)
  const alts: string[] = []
  // light synonyms for Security Engineer
  if (/security/i.test(base) && /engineer/i.test(base)) {
    ['Security Systems Engineer','Fire & Security Engineer','Security Service Engineer','Security Installation Engineer','CCTV Engineer','Access Control Engineer']
      .forEach(t => alts.push(t))
  }
  const altPhrases = alts.map(a => phraseFields(['current_job_title'], a)).filter(Boolean)
  const parts = [phrase, tokenAND, ...altPhrases].filter(Boolean)
  return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`
}

function onlyUnique<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>(), out: T[] = []
  for (const it of arr) { const k = key(it); if (!k || seen.has(k)) continue; seen.add(k); out.push(it) }
  return out
}
function findLinkedIn(d: any): string | null {
  const cands = [d.linkedin, d.linkedin_url, d.linkedIn, d.linkedinUrl, d.social?.linkedin, d.social_links?.linkedin, d.urls?.linkedin].filter(Boolean)
  for (const v of cands) if (typeof v === 'string' && v.includes('linkedin.com')) return v
  return null
}
// build a tolerant location gate (keep if any token from job location appears)
function makeLocationGate(jobLoc?: string) {
  const toks = splitTokens(jobLoc).map(t => t.toLowerCase())
  if (!toks.length) return (_: any) => true
  return (d: any) => {
    const loc = String(d.current_location_name || d.current_city || d.current_address || d.location || '').toLowerCase()
    // keep if candidate has no location (don’t over-filter), or any token matches
    if (!loc) return true
    return toks.some(t => loc.includes(t))
  }
}

/* ---------------- route ---------------- */

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

  // resolve job
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
      skills: Array.isArray(pos.skills) ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean)
            : typeof pos.keywords === 'string' ? pos.keywords.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      description: String(pos.public_description || pos.publicDescription || pos.description || ''),
      qualifications: [],
    }
  }
  if (!job?.title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  const title = String(job.title || '').trim()
  const location = String(job.location || '').trim()
  const locationGate = makeLocationGate(location)

  const titleClause = buildTitleClause(title) || '*:*'
  const perQueryLimit = 100

  // return fields (matrix vars)
  const fl = [
    'id','candidate_id','first_name','last_name',
    'current_job_title','current_city','current_location_name',
    'linkedin','linkedin_url'
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

  const searches = [
    { label: 'S1_ASC',  sort: 'created_date asc'  as const },
    { label: 'S2_DESC', sort: 'created_date desc' as const },
  ]

  const allRaw: any[] = []
  const dbg: any[] = []

  for (const s of searches) {
    const matrix = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent(s.sort)}`
    const url = `${searchBase}/${matrix}?q=${encodeURIComponent(titleClause)}&limit=${perQueryLimit}`
    const resp = await fetchWithRetry(url)
    let docs: any[] = []
    let errorText = ''
    if (resp.ok) {
      const json = await resp.json().catch(() => ({}))
      docs = json?.response?.docs || json?.data || []
      allRaw.push(...docs) // push *raw*, no gating yet
    } else {
      errorText = await resp.text().catch(() => '')
    }
    console.log('[match.run]', s.label, 'q=', titleClause, ' sort=', s.sort, ' status=', resp.status, ' rawCount=', docs.length, errorText ? ` error=${errorText.slice(0,200)}` : '')
    if (debug) dbg.push({ label: s.label, sort: s.sort, q: titleClause, status: resp.status, rawCount: docs.length, sample: docs[0] || null, error: errorText })
  }

  // dedupe raw, then gate by location tokens
  const dedupRaw = onlyUnique(allRaw, (d: any) => String(d.id ?? d.candidate_id ?? ''))
  const gated = dedupRaw.filter(locationGate)

  // map for AI
  const candidates = gated.map(d => ({
    id: String(d.id ?? d.candidate_id ?? ''),
    name: [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.full_name ?? ''),
    location: d.current_city || d.current_location_name || '',
    currentJobTitle: d.current_job_title || '',
    skills: [] as string[],
    linkedin: d.linkedin || findLinkedIn(d),
  })).filter(c => c.id)

  // score with AI
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
    score: scoreById.get(c.id)?.score ?? 0,
    reason: scoreById.get(c.id)?.reason ?? '',
  })).sort((a, b) => b.score - a.score)

  // UI pagination
  const totalRaw = allRaw.length
  const totalGated = gated.length
  const total = scored.length
  const size = Math.max(1, Math.min(pageSize, 50))
  const start = (page - 1) * size
  const results = start < total ? scored.slice(start, start + size) : []

  return NextResponse.json({
    results, total, page, pageSize: size,
    ...(debug ? { debug: { titleClause, totalRaw, afterDedupe: dedupRaw.length, totalGated, searches: dbg } } : {}),
  })
}

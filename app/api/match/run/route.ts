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
  limit?: number   // how many to return after scoring (default 20)
}

function esc(s?: string) {
  if (!s) return ''
  return String(s).replace(/"/g, '\\"').trim()
}
function qPhrase(field: string, value?: string) {
  const v = esc(value)
  return v ? `${field}:"${v}"` : ''
}
function qAny(field: string, items: string[]) {
  const list = items.map(esc).filter(Boolean)
  if (!list.length) return ''
  return `(${list.map(v => `${field}:"${v}"`).join(' OR ')})`
}
function cleanJoin(parts: string[]) {
  return parts.filter(Boolean).join(' AND ')
}
function onlyUnique<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>(); const out: T[] = []
  for (const it of arr) {
    const k = key(it)
    if (!k || seen.has(k)) continue
    seen.add(k); out.push(it)
  }
  return out
}
function findLinkedIn(d: any): string | null {
  const cands = [
    d.linkedin, d.linkedIn, d.linkedin_url, d.linkedinUrl,
    d.social?.linkedin, d.social_links?.linkedin,
    d.urls?.linkedin, d.contacts?.linkedin,
  ].filter(Boolean)
  for (const v of cands) {
    if (typeof v === 'string' && v.includes('linkedin.com')) return v
  }
  const arrays = [d.websites, d.links, d.social, d.social_links].filter(Array.isArray)
  for (const arr of arrays as any[]) {
    const hit = arr.find((x: any) => typeof x === 'string' && x.includes('linkedin.com'))
            || arr.find((x: any) => typeof x?.url === 'string' && x.url.includes('linkedin.com'))
    if (hit) return typeof hit === 'string' ? hit : hit.url
  }
  return null
}

export async function POST(req: NextRequest) {
  requiredEnv()
  const body = (await req.json().catch(() => ({}))) as RunReq
  const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 50)

  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // 1) Get job details if only jobId provided
  let job = body.job
  if (!job && body.jobId) {
    const call = async () => fetch(positionUrl(body.jobId!), {
      headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY },
      cache: 'no-store'
    })
    let r = await call()
    if (r.status === 401 || r.status === 403) {
      const ok = await refreshIdToken(session.user?.email || session.sessionId || '')
      if (ok) {
        const s2 = await getSession()
        idToken = s2.tokens?.idToken
        r = await call()
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
            : typeof pos.keywords === 'string' ? pos.keywords.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [],
      description: String(pos.public_description || pos.publicDescription || pos.description || ''),
    }
  }
  if (!job) return NextResponse.json({ error: 'Missing job' }, { status: 400 })

  const title = String(job.title || '')
  const location = String(job.location || '')
  const skills = Array.isArray(job.skills) ? job.skills.map(String) : []
  const qualifications = Array.isArray(job.qualifications) ? job.qualifications.map(String) : []
  const description = String(job.description || '')

  // 2) Build 5 queries (strict → broad)
  const STRATS: string[] = [
    cleanJoin([ qPhrase('job-title', title), qPhrase('location-text', location), qAny('keywords', skills) ]),
    cleanJoin([ qPhrase('job-title', title), qPhrase('location-text', location) ]),
    cleanJoin([ qPhrase('job-title', title), qAny('keywords', skills) ]),
    cleanJoin([ qAny('keywords', skills) ]),
    cleanJoin([ qPhrase('job-title', title) ]),
  ].map(s => s || '*:*') // last resort: match all (won’t matter, AI ranks)

  // fields to fetch (use matrix vars)
  const fl = [
    'id','candidate_id','first_name','last_name',
    'current_location','keywords','skills','linkedin_url'
  ].join(',')

  // 3) Run searches and collect results
  const all: any[] = []
  const headers = { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY }
  for (const q of STRATS) {
    const matrix = `;fl=${encodeURIComponent(fl)}`
    const url = `${searchBase}/${matrix}?q=${encodeURIComponent(q)}&limit=50`
    const resp = await fetch(url, { headers, cache: 'no-store' })
    if (!resp.ok) continue
    const json = await resp.json().catch(() => ({}))
    const docs = json?.response?.docs || json?.data || []
    all.push(...docs)
  }

  // 4) Dedupe, map, and keep light payload for scoring
  const dedup = onlyUnique(all, (d: any) => String(d.id ?? d.candidate_id ?? ''))
  const candidates = dedup.map((d: any) => ({
    id: String(d.id ?? d.candidate_id ?? ''),
    name: [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.full_name ?? ''),
    location: d.current_location || d.location || '',
    skills: d.skills || d.keywords || [],
    linkedin: findLinkedIn(d),
  })).filter(c => c.id)

  // 5) Ask AI to score
  const aiResp = await fetch(new URL('/api/ai/analyze', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job: { title, location, skills, qualifications, description },
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

  const merged = candidates.map(c => ({
    candidateId: c.id,
    candidateName: c.name,
    linkedin: c.linkedin,
    score: scoreById.get(c.id)?.score ?? 0,
    reason: scoreById.get(c.id)?.reason ?? '',
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, limit)

  return NextResponse.json({ results: merged })
}

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

// `(f1:"v"# OR f2:"v"#)` — exact phrase on both title fields
function titlePhrase(value?: string) {
  const v = esc(value)
  if (!v) return ''
  const F = ['current_job_title', 'job_title']
  return `(${F.map(f => `${f}:"${v}"#`).join(' OR ')})`
}

function onlyUnique<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>(), out: T[] = []
  for (const it of arr) { const k = key(it); if (!k || seen.has(k)) continue; seen.add(k); out.push(it) }
  return out
}

function findLinkedIn(d: any): string | null {
  const cands = [d.linkedin, d.linkedIn, d.linkedin_url, d.linkedinUrl, d.social?.linkedin, d.social_links?.linkedin, d.urls?.linkedin, d.contacts?.linkedin].filter(Boolean)
  for (const v of cands) if (typeof v === 'string' && v.includes('linkedin.com')) return v
  const arrays = [d.websites, d.links, d.social, d.social_links].filter(Array.isArray)
  for (const arr of arrays as any[]) {
    const hit = arr.find((x: any) => typeof x === 'string' && x.includes('linkedin.com'))
      || arr.find((x: any) => typeof x?.url === 'string' && x.url.includes('linkedin.com'))
    if (hit) return typeof hit === 'string' ? hit : hit.url
  }
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

  // 1) Resolve job (by id) if not provided
  let job = body.job
  if (!job && body.jobId) {
    const call = async () =>
      fetch(positionUrl(body.jobId!), {
        headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY },
        cache: 'no-store',
      })
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
      skills: Array.isArray(pos.skills)
        ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean)
        : typeof pos.keywords === 'string'
          ? pos.keywords.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [],
      description: String(pos.public_description || pos.publicDescription || pos.description || ''),
    }
  }
  if (!job) return NextResponse.json({ error: 'Missing job' }, { status: 400 })

  const title = String(job.title || '').trim()
  const qualifications = Array.isArray(job.qualifications) ? job.qualifications.map(String) : []
  const description = String(job.description || '')

  // 2) Build a single title-only query (exact phrase)
  const qTitle = titlePhrase(title)
  if (!qTitle) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  // 3) matrix vars (return fields) — minimal
  const fl = [
    'id',
    'candidate_id',
    'first_name',
    'last_name',
    'current_job_title',
    'current_location_name',
    'linkedin_url',
  ].join(',')

  // helper fetch with retry
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

  // 4) Run the single search
  const matrix = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent('created_date desc')}`
  const limit = Math.min(Math.max(pageSize, 1), 50)
  const url = `${searchBase}/${matrix}?q=${encodeURIComponent(qTitle)}&limit=${limit}`

  const resp = await fetchWithRetry(url)
  let docs: any[] = []
  let errorText = ''
  if (resp.ok) {
    const json = await resp.json().catch(() => ({}))
    docs = json?.response?.docs || json?.data || []
  } else {
    errorText = await resp.text().catch(() => '')
  }

  console.log('[match.run:TITLE_ONLY]', 'q=', qTitle, ' status=', resp.status, ' count=', docs.length, errorText ? ` error=${errorText.slice(0, 200)}` : '')

  // 5) Map (same output shape your dashboard expects)
  const dedup = onlyUnique(docs, (d: any) => String(d.id ?? d.candidate_id ?? ''))
  const candidates = dedup.map((d: any) => ({
    id: String(d.id ?? d.candidate_id ?? ''),
    name: [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.full_name ?? ''),
    location: d.current_location_name || d.current_location || d.location || '',
    skills: [], // not fetched in this minimal search
    linkedin: findLinkedIn(d),
  })).filter(c => c.id)

  // 6) (Optional) keep AI scoring so the UI still works
  const aiResp = await fetch(new URL('/api/ai/analyze', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job: { title, location: '', skills: [], qualifications, description },
      candidates: candidates.map(c => ({ id: c.id, name: c.name, location: c.location, skills: [] })),
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

  // 7) Pagination
  const total = scored.length
  const pageSizeClamped = Math.max(1, Math.min(pageSize, 50))
  const start = (page - 1) * pageSizeClamped
  const results = start < total ? scored.slice(start, start + pageSizeClamped) : []

  return NextResponse.json({
    results,
    total,
    page,
    pageSize: pageSizeClamped,
    ...(debug ? { debug: [{ label: 'T1', q: qTitle, status: resp.status, count: docs.length, sampleId: docs[0]?.id ?? docs[0]?.candidate_id ?? null }] } : {}),
  })
}

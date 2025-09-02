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
    location?: string      // e.g., "London, UK" -> we'll parse city "London"
    skills?: string[]      // we'll take first 2
    qualifications?: string[]
    description?: string
  }
  limit?: number           // default to 100
}

// ---------- helpers ----------
const esc = (s?: string) => String(s ?? '').replace(/"/g, '\\"').trim()
const toClause = (field: string, value: string) => `${field}:"${esc(value)}"#`

function uniq(a: string[] = []) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of a) {
    const t = (v ?? '').toString().trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(t) }
  }
  return out
}

// Replace the old pickCityFromLocation with this generic one
function pickCityFromLocation(loc?: string) {
  if (!loc) return ''
  // take text before the first comma
  let s = (loc.split(',')[0] || '').trim()
  // collapse whitespace
  s = s.replace(/\s+/g, ' ')

  // strip leading qualifiers like:
  // South, West, North-East, South West, Central, Centre, Greater, Inner, Outer, City of
  const qualifier = /^(?:(?:north|south|east|west)(?:\s*[- ]\s*(?:east|west))?|central|centre|greater|inner|outer|city of)\s+/i
  // remove multiple stacked qualifiers, e.g., "Greater South West London"
  while (qualifier.test(s)) s = s.replace(qualifier, '').trim()

  return s
}

// Vincere’s example shows spaces as '+', so we mirror that for the q parameter
function encodeForVincereQuery(q: string) {
  return encodeURIComponent(q).replace(/%20/g, '+')
}

// Build q: current_job_title:"Title"# AND current_city:"City"# AND (skill:"S1"# OR skill:"S2"#)
// No extra parens around title/city; skills remain wrapped.
function buildQuery(job: NonNullable<RunReq['job']>) {
  const title = (job.title ?? '').trim()
  const city  = pickCityFromLocation(job.location)

  const titleClause = title ? toClause('current_job_title', title) : ''
  const cityClause  = city  ? toClause('current_city', city) : ''

  const skills = uniq(job.skills ?? []).slice(0, 2)
  const skillsClause = skills.length
    ? `(${skills.map(s => toClause('skill', s)).join(' OR ')})`
    : ''

  // Assemble: title AND city AND (skills)
  let q = ''
  if (titleClause) q = titleClause
  if (cityClause)  q = q ? `${q} AND ${cityClause}` : cityClause
  if (skillsClause) q = q ? `${q} AND ${skillsClause}` : skillsClause

  return q || '*:*'
}

// matrix_vars EXACTLY as requested (no mlt.fl)
function buildMatrixVars() {
  return 'fl=id,first_name,last_name,current_location_name,current_job_title,linkedin,keywords,skill,edu_qualification,edu_degree,edu_course,edu_institution,edu_training;sort=created_date asc'
}

// Prefer provided job (already extracted on the client)
async function resolveJob(_session: any, body: RunReq): Promise<RunReq['job'] | null> {
  if (body.job) return body.job
  return null
}

// GET with one auto-refresh retry
async function fetchWithAutoRefresh(url: string, idToken: string, userKey: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {})
  headers.set('id-token', idToken)
  headers.set('x-api-key', config.VINCERE_API_KEY)
  headers.set('accept', 'application/json')

  const doFetch = (h: Headers) => fetch(url, { ...init, headers: h, method: 'GET', cache: 'no-store' })

  let resp = await doFetch(headers)
  if (resp.status === 401 || resp.status === 403) {
    try {
      const refreshed = await refreshIdToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        const id2 = s2.tokens?.idToken || ''
        if (id2) {
          headers.set('id-token', id2)
          resp = await doFetch(headers)
        }
      }
    } catch { /* ignore */ }
  }
  return resp
}

export async function POST(req: NextRequest) {
  try {
    requiredEnv()

    const session = await getSession()
    const idToken = session.tokens?.idToken || ''
    const userKey = session.user?.email || session.sessionId || 'anonymous'
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere.' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as RunReq
    const job = await resolveJob(session, body)
    if (!job) {
      return NextResponse.json({ error: 'Missing job details.' }, { status: 400 })
    }

    const matrixVars = buildMatrixVars()
    const qRaw = buildQuery(job)

    // clamp limit 1..100, include start=0 as per example
    const limit = Math.max(1, Math.min(100, Number(body.limit ?? 100)))
    const start = 0

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const encodedMatrix = encodeURIComponent(matrixVars)
    const encodedQ = encodeForVincereQuery(qRaw)

    const url =
      `${base}/api/v2/candidate/search/${encodedMatrix}` +
      `?q=${encodedQ}&start=${start}&limit=${limit}`

    const resp = await fetchWithAutoRefresh(url, idToken, userKey)
    const text = await resp.text()
    if (!resp.ok) {
      return NextResponse.json(
        { error: 'Vincere search failed', status: resp.status, detail: text, url, qRaw },
        { status: 400 }
      )
    }

    let json: any = {}
    try { json = JSON.parse(text) } catch { json = {} }
    const candidates = Array.isArray(json?.data ?? json?.items) ? (json.data ?? json.items) : []
    const count = Number(json?.count ?? json?.total ?? candidates.length ?? 0)

    // Compact mapping for the UI/AI
    const results = candidates.map((c: any) => ({
      id: String(c?.id ?? ''),
      first_name: c?.first_name ?? '',
      last_name: c?.last_name ?? '',
      name: [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim(),
      current_job_title: c?.current_job_title ?? '',
      current_location_name: c?.current_location_name ?? '',
      linkedin: c?.linkedin ?? '',
      keywords: c?.keywords ?? [],
      skill: c?.skill ?? [],
      edu_qualification: c?.edu_qualification ?? [],
      edu_degree: c?.edu_degree ?? [],
      edu_course: c?.edu_course ?? [],
      edu_institution: c?.edu_institution ?? [],
      edu_training: c?.edu_training ?? [],
    }))

    return NextResponse.json({
      ok: true,
      query: { matrix_vars: matrixVars, q: qRaw, url, start, limit },
      count,
      candidates: results,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

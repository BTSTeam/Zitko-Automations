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

// Extract a city name from a free-text location, with a special rule for London
function pickCityFromLocation(loc?: string) {
  if (!loc) return ''
  // take the first comma-delimited chunk, e.g., "South West London, UK" -> "South West London"
  const first = loc.split(',')[0]?.trim() || ''
  if (!first) return ''

  // If it contains the word "London" in any form, force "London"
  if (/\blondon\b/i.test(first)) return 'London'

  // Otherwise return the first chunk as the city (e.g., "Manchester", "Bristol")
  return first
}

// Vincere’s example shows spaces as '+', so we mirror that for the q parameter
function encodeForVincereQuery(q: string) {
  return encodeURIComponent(q).replace(/%20/g, '+')
}

// Build q: title AND city AND (skill1 OR skill2)
// If city/skills missing, fall back gracefully
function buildQuery(job: NonNullable<RunReq['job']>) {
  const title = (job.title ?? '').trim()
  const city = pickCityFromLocation(job.location)

  const titleClause = title ? toClause('current_job_title', title) : ''
  const cityClause  = city  ? toClause('current_city', city) : ''

  const skills = uniq(job.skills ?? []).slice(0, 2)
  const skillBlock = skills.length
    ? `(${skills.map(s => toClause('skill', s)).join(' OR ')})`
    : ''

  // Combine per request: title AND city AND (skill1 OR skill2)
  // Omit missing parts sensibly
  const parts: string[] = []
  if (titleClause) parts.push(titleClause)
  if (cityClause)  parts.push(cityClause)
  if (skillBlock)  parts.push(skillBlock)

  if (parts.length === 0) return '*:*'
  if (parts.length === 1) return parts[0]
  return parts.map(p => (p.startsWith('(') ? p : `(${p})`)).join(' AND ')
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

    // --- replace from: "let json: any = {}" down to the return JSON ---

let json: any = {}
try { json = JSON.parse(text) } catch { json = {} }

// Vincere candidate search shape: { category, result: { start, total, items: [...] } }
const result = json?.result

const rawItems = Array.isArray(result?.items)
  ? result.items
  : Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.items)
      ? json.items
      : []

const count = Number(
  result?.total ??
  json?.count ??
  json?.total ??
  rawItems.length ??
  0
)

// helpers to flatten arrays of strings/option objects
const toList = (v: any) =>
  Array.isArray(v)
    ? v.map((x) =>
        typeof x === 'string'
          ? x
          : (x?.description ?? x?.value ?? '')
      ).filter(Boolean)
    : []

// Map to the shape your UI expects
const results = rawItems.map((c: any) => {
  const first = c?.first_name ?? c?.firstName ?? ''
  const last  = c?.last_name ?? c?.lastName ?? ''
  const full  = (c?.name || `${first} ${last}`).trim()
  const title = c?.current_job_title ?? c?.title ?? ''
  const location = c?.current_location_name ?? c?.location ?? ''
  const city = c?.current_city ?? ''

  const skills = toList(c?.skill)
  const quals = [
    ...toList(c?.edu_qualification),
    ...toList(c?.edu_degree),
    ...toList(c?.edu_course),
    ...toList(c?.edu_institution),
    ...toList(c?.edu_training),
  ]

  return {
    id: String(c?.id ?? ''),
    firstName: first,
    lastName: last,
    fullName: full,
    title,
    location,
    city,
    skills,
    qualifications: quals,
    linkedin: c?.linkedin ?? null,
  }
})

return NextResponse.json({
  ok: true,
  query: { matrix_vars: matrixVars, q: qRaw, url, start, limit },
  count,
  // return both keys for UI compatibility
  results,
  candidates: results,
})

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

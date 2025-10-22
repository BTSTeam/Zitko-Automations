// app/api/apollo/people-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_URL = 'https://api.apollo.io/api/v1/mixed_people/search'

type InBody = {
  person_titles?: string[] | string
  include_similar_titles?: boolean | string
  q_keywords?: string
  person_locations?: string[] | string
  person_seniorities?: string[] | string
  page?: number | string
  per_page?: number | string
}

/** Normalize array-like values: accept array or comma-separated string */
function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean)
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

/** Strict boolean coercion for "true"/"false"/1/0 and real booleans */
function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
  }
  return undefined
}

/** Safe positive integer with fallback */
function toPosInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/** (Optional) guard against invalid seniorities */
const ALLOWED_SENIORITIES = new Set([
  'owner',
  'founder',
  'c_suite',
  'partner',
  'vp',
  'head',
  'director',
  'manager',
  'senior',
  'entry',
  'intern',
])

export async function POST(req: NextRequest) {
  const DEBUG = (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true'

  let inBody: InBody = {}
  try {
    inBody = (await req.json()) as InBody
  } catch {
    // ignore — empty body
  }

  // ---- Map ONLY the documented fields you listed ----
  const person_titles = toArray(inBody.person_titles)
  const include_similar_titles = toBool(inBody.include_similar_titles)
  const q_keywords = (inBody.q_keywords || '').toString().trim()
  const person_locations = toArray(inBody.person_locations)

  // Filter seniorities to allowed set (quietly drop anything else)
  const person_seniorities = toArray(inBody.person_seniorities).filter(s =>
    ALLOWED_SENIORITIES.has(s as any),
  )

  const page = toPosInt(inBody.page, 1)
  const per_page = toPosInt(inBody.per_page, 50) // sensible default, user-controllable

  // ---- Build Apollo querystring (Apollo accepts POST + query params) ----
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('per_page', String(per_page))

  person_titles.forEach(t => params.append('person_titles[]', t))
  person_locations.forEach(l => params.append('person_locations[]', l))
  person_seniorities.forEach(s => params.append('person_seniorities[]', s))
  if (typeof include_similar_titles === 'boolean') {
    params.set('include_similar_titles', include_similar_titles ? 'true' : 'false')
  }
  if (q_keywords) params.set('q_keywords', q_keywords)

  // ---- Auth: OAuth bearer preferred; fallback to X-Api-Key ----
  const session = await getSession()
  const userKey = session.user?.email || session.sessionId || ''
  let accessToken = session.tokens?.apolloAccessToken
  const apiKey = process.env.APOLLO_API_KEY

  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: 'Not authenticated: no Apollo OAuth token or APOLLO_API_KEY present' },
      { status: 401 },
    )
  }

  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    }
    if (accessToken) h.Authorization = `Bearer ${accessToken}`
    else if (apiKey) h['X-Api-Key'] = apiKey
    return h
  }

  const urlWithQs = `${APOLLO_URL}?${params.toString()}`
  const call = (headers: Record<string, string>) =>
    fetch(urlWithQs, {
      method: 'POST',
      headers,
      // Apollo is fine with empty body when using query params
      body: JSON.stringify({}), // keep POST semantics; avoids some edge proxies
      cache: 'no-store',
    })

  if (DEBUG) {
    const dbgHeaders = { ...buildHeaders() }
    if (dbgHeaders.Authorization) dbgHeaders.Authorization = 'Bearer ***'
    if (dbgHeaders['X-Api-Key']) dbgHeaders['X-Api-Key'] = '***'
    console.info('[Apollo DEBUG] →', { url: urlWithQs, headers: dbgHeaders })
  }

  try {
    let resp = await call(buildHeaders())

    // 401/403 → try one refresh for OAuth
    if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        accessToken = s2.tokens?.apolloAccessToken
        resp = await call(buildHeaders())
      }
    }

    const raw = await resp.text()
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Apollo error: ${resp.status} ${resp.statusText}`, details: raw?.slice(0, 2000) },
        { status: resp.status || 400 },
      )
    }

    let data: any = {}
    try {
      data = raw ? JSON.parse(raw) : {}
    } catch {
      data = {}
    }

    const arr: any[] = Array.isArray(data?.contacts)
      ? data.contacts
      : Array.isArray(data?.people)
      ? data.people
      : []

    const people = arr.map((p: any) => {
      const first = (p?.first_name ?? '').toString().trim()
      const last = (p?.last_name ?? '').toString().trim()
      const name =
        (p?.name && String(p.name).trim()) ||
        [first, last].filter(Boolean).join(' ').trim() ||
        null

      const title =
        (p?.title && String(p.title).trim()) ||
        (Array.isArray(p?.employment_history) && p.employment_history[0]?.title) ||
        null

      const company =
        (p?.organization?.name && String(p.organization.name).trim()) ||
        (Array.isArray(p?.employment_history) && p.employment_history[0]?.organization_name) ||
        null

      const location =
        p?.location?.name ??
        [p?.city, p?.state, p?.country].filter(Boolean).join(', ') ||
        null

      const linkedin_url =
        typeof p?.linkedin_url === 'string' && p.linkedin_url ? p.linkedin_url : null

      const autoScore =
        typeof p?.people_auto_score === 'number'
          ? p.people_auto_score
          : typeof p?.auto_score === 'number'
          ? p.auto_score
          : null

      return {
        id: p?.id ?? '',
        name,
        title: title ? String(title).trim() : null,
        company: company ? String(company).trim() : null,
        location: location || null,
        linkedin_url,
        autoScore,
      }
    })

    // Sort by auto score (desc) then name
    people.sort((a, b) => (b.autoScore ?? 0) - (a.autoScore ?? 0) || String(a.name).localeCompare(String(b.name)))

    return NextResponse.json({
      meta: {
        page,
        per_page,
        count: people.length,
      },
      people,
      raw, // keep for debugging in UI if needed
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error during Apollo request', details: String(err) },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/people-search with a JSON body.' },
    { status: 405 },
  )
}

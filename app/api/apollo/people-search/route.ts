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

/** Apollo seniority allow-list */
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
    // ignore; empty body is allowed
  }

  // ---- Map input fields ----
  const person_titles = toArray(inBody.person_titles)
  const include_similar_titles = toBool(inBody.include_similar_titles) ?? true
  const q_keywords = (inBody.q_keywords || '').toString().trim()
  const person_locations = toArray(inBody.person_locations)

  const person_seniorities = toArray(inBody.person_seniorities).filter(s =>
    ALLOWED_SENIORITIES.has(s as any),
  )

  const page = toPosInt(inBody.page, 1)
  const per_page = 25 // fixed page size to keep UI predictable

  // ---- Build Apollo querystring ----
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('per_page', String(per_page))
  params.set('include_similar_titles', include_similar_titles ? 'true' : 'false')
  person_titles.forEach(t => params.append('person_titles[]', t))
  person_locations.forEach(l => params.append('person_locations[]', l))
  person_seniorities.forEach(s => params.append('person_seniorities[]', s))
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
      body: JSON.stringify({}), // POST semantics required by Apollo even when params are in the QS
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

    // Retry once on 401/403 if using OAuth and a refresh is possible
    if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        accessToken = s2.tokens?.apolloAccessToken
        resp = await call(buildHeaders())
      }
    }

    const rawText = await resp.text()

    if (!resp.ok) {
      return NextResponse.json(
        {
          error: `Apollo error: ${resp.status} ${resp.statusText}`,
          details: rawText?.slice(0, 2000),
        },
        { status: resp.status || 400 },
      )
    }

    // Parse safely
    let payload: any = {}
    try {
      payload = rawText ? JSON.parse(rawText) : {}
    } catch {
      payload = {}
    }

    // Apollo returns either `contacts` or `people`
    const rawList: any[] = Array.isArray(payload?.contacts)
      ? payload.contacts
      : Array.isArray(payload?.people)
      ? payload.people
      : []

    // Map to the exact fields your UI needs
    const people = rawList.map((p: any) => {
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

      const organization_name =
        (p?.organization?.name && String(p.organization.name).trim()) ||
        (Array.isArray(p?.employment_history) &&
          p.employment_history[0]?.organization_name) ||
        null

      // Prefer explicit formatted address fields Apollo often returns
      const formatted_address =
        (typeof p?.present_raw_address === 'string' && p.present_raw_address.trim()) ||
        (typeof p?.formatted_address === 'string' && p.formatted_address.trim()) ||
        (p?.location?.name ??
          [p?.city, p?.state, p?.country].filter(Boolean).join(', ')) ||
        null

      const linkedin_url =
        typeof p?.linkedin_url === 'string' && p.linkedin_url ? p.linkedin_url : null

      const facebook_url =
        typeof p?.facebook_url === 'string' && p.facebook_url ? p.facebook_url : null

      const headline =
        typeof p?.headline === 'string' && p.headline.trim() ? p.headline.trim() : null

      return {
        id: p?.id ?? '',
        name,
        title: title ? String(title).trim() : null,
        organization_name: organization_name ? String(organization_name).trim() : null,
        formatted_address,
        linkedin_url,
        facebook_url,
        headline,
      }
    })

    return NextResponse.json({
      meta: { page, per_page, count: people.length },
      pagination: payload?.pagination ?? { page, per_page },
      people,
      apollo_pretty: JSON.stringify(payload, null, 2), // helpful for debugging in UI
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

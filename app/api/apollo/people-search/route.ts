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
  q_keywords?: string[] | string   // we accept chips; join to string
  person_locations?: string[] | string
  person_seniorities?: string[] | string
  page?: number | string
  per_page?: number | string
}

function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean)
  return v.split(',').map(s => s.trim()).filter(Boolean)
}
function toPosInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
const ALLOWED_SENIORITIES = new Set([
  'owner','founder','c_suite','partner','vp','head','director','manager','senior','entry','intern',
])

export async function POST(req: NextRequest) {
  const DEBUG = (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true'

  let inBody: InBody = {}
  try { inBody = (await req.json()) as InBody } catch {}

  const person_titles = toArray(inBody.person_titles)
  const person_locations = toArray(inBody.person_locations)
  const person_seniorities = toArray(inBody.person_seniorities).filter(s => ALLOWED_SENIORITIES.has(s as any))

  // q_keywords can arrive as array (chips) or string. Join chips with spaces.
  let q_keywords = ''
  if (Array.isArray(inBody.q_keywords)) q_keywords = inBody.q_keywords.filter(Boolean).join(' ')
  else if (typeof inBody.q_keywords === 'string') q_keywords = inBody.q_keywords.trim()

  const page = toPosInt(inBody.page, 1)
  const per_page = 25 // fixed by design

  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('per_page', String(per_page))
  params.set('include_similar_titles', 'true')
  person_titles.forEach(t => params.append('person_titles[]', t))
  person_locations.forEach(l => params.append('person_locations[]', l))
  person_seniorities.forEach(s => params.append('person_seniorities[]', s))
  if (q_keywords) params.set('q_keywords', q_keywords)

  // Auth
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
    fetch(urlWithQs, { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-store' })

  if (DEBUG) {
    const dbgHeaders = { ...buildHeaders() }
    if (dbgHeaders.Authorization) dbgHeaders.Authorization = 'Bearer ***'
    if (dbgHeaders['X-Api-Key']) dbgHeaders['X-Api-Key'] = '***'
    console.info('[Apollo DEBUG] →', { url: urlWithQs, headers: dbgHeaders })
  }

  try {
    let resp = await call(buildHeaders())
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

    // Parse safely (double-parse guard)
    let data: any = {}
    try { data = raw ? JSON.parse(raw) : {} } catch { data = {} }
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch { data = {} }
    }

    // Use contacts (primary); some responses return "people"
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

      // From first (most recent) employment history if available, else org.name
      const organization_name =
        (Array.isArray(p?.employment_history) && p.employment_history[0]?.organization_name) ||
        (p?.organization?.name && String(p.organization.name).trim()) ||
        null

      // Address preference order
      const formatted_address =
        (typeof p?.formatted_address === 'string' && p.formatted_address.trim()) ||
        (typeof p?.present_raw_address === 'string' && p.present_raw_address.trim()) ||
        ((p?.location?.name ?? [p?.city, p?.state, p?.country].filter(Boolean).join(', ')) || null)

      const headline =
        (typeof p?.headline === 'string' && p.headline.trim()) || null

      const linkedin_url =
        typeof p?.linkedin_url === 'string' && p.linkedin_url ? p.linkedin_url : null

      const facebook_url =
        typeof p?.facebook_url === 'string' && p.facebook_url ? p.facebook_url : null

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
        organization_name: organization_name ? String(organization_name).trim() : null,
        formatted_address,
        headline,
        linkedin_url,
        facebook_url,
        autoScore,
      }
    })

    people.sort(
      (a, b) =>
        (b.autoScore ?? 0) - (a.autoScore ?? 0) ||
        String(a.name ?? '').localeCompare(String(b.name ?? '')),
    )

    return NextResponse.json({
      meta: { page, per_page, count: people.length },
      breadcrumbs: data?.breadcrumbs ?? [],
      pagination: data?.pagination ?? { page, per_page },
      people,
      apollo: data,
      apollo_pretty: JSON.stringify(data, null, 2),
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

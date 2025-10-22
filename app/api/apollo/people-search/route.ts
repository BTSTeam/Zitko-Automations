// app/api/apollo/people-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

type SearchBody = {
  // Legacy keys we used before
  title?: string | string[]
  location?: string | string[]
  keywords?: string
  domains?: string | string[]
  seniorities?: string | string[]
  emailStatus?: string | string[]
  page?: number
  perPage?: number

  // Apollo-style keys you wanted to send from the UI
  personTitles?: string[] | string
  personLocations?: string[] | string
  personSeniorities?: string[] | string
  qKeywords?: string
  qOrganizationDomains?: string[] | string
  contactEmailStatus?: string[] | string

  // UI-only (we do NOT forward directly to Apollo in order to avoid 422s)
  personDepartmentOrSubdepartments?: string[] | string
}

/** Convert comma-separated strings or arrays to a trimmed string array */
function toArray(value?: string | string[]): string[] {
  if (!value) return []
  return Array.isArray(value)
    ? value.map((s) => s.trim()).filter(Boolean)
    : value.split(',').map((s) => s.trim()).filter(Boolean)
}

const APOLLO_URL = 'https://api.apollo.io/api/v1/mixed_people/search'

export async function POST(req: NextRequest) {
  const DEBUG = (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true'

  let body: SearchBody = {}
  try {
    body = (await req.json()) as SearchBody
  } catch {
    body = {}
  }

  // --- Gather from BOTH legacy and new keys ---

  const titles = [
    ...toArray(body.title as any),
    ...toArray(body.personTitles as any),
  ]

  const locations = [
    ...toArray(body.location as any),
    ...toArray(body.personLocations as any),
  ]

  const seniorities = [
    ...toArray(body.seniorities as any),
    ...toArray(body.personSeniorities as any),
  ]

  // Keywords: prefer qKeywords; fall back to keywords
  const qKeywords =
    (typeof body.qKeywords === 'string' ? body.qKeywords.trim() : '') ||
    (typeof body.keywords === 'string' ? body.keywords.trim() : '')

  // Organization domains: accept either legacy or new field name
  const orgDomains = [
    ...toArray(body.domains as any),
    ...toArray(body.qOrganizationDomains as any),
  ]

  const emailStatusArr = [
    ...toArray(body.emailStatus as any),
    ...toArray(body.contactEmailStatus as any),
  ]

  // Optional departments coming from UI – we currently DO NOT forward this as a
  // separate Apollo field to avoid 422; if provided, we blend into q_keywords.
  const departmentsFromUI = toArray(body.personDepartmentOrSubdepartments as any)

  // Final keywords string (merge base keywords + departments as hints)
  const mergedKeywords = [
    qKeywords,
    ...departmentsFromUI.map((d) => d.replaceAll('_', ' ')),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  const page = Number.isFinite(body.page) && (body.page as number) > 0 ? (body.page as number) : 1
  const perPage = 25 // enforce UI requirement

  // --- Build Apollo payload using documented People Search fields only ---
  const payload: Record<string, any> = {
    page,
    per_page: perPage,
  }
  if (titles.length)      payload.person_titles = titles
  if (locations.length)   payload.person_locations = locations
  if (seniorities.length) payload.person_seniorities = seniorities
  if (orgDomains.length)  payload.q_organization_domains = orgDomains
  if (emailStatusArr.length) payload.contact_email_status = emailStatusArr
  if (mergedKeywords)     payload.q_keywords = mergedKeywords

  // Auth: prefer OAuth bearer; fall back to X-Api-Key
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

  const call = (headers: Record<string, string>) =>
    fetch(APOLLO_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

  if (DEBUG) {
    const dbgHeaders = { ...buildHeaders() }
    if (dbgHeaders.Authorization) dbgHeaders.Authorization = 'Bearer ***'
    if (dbgHeaders['X-Api-Key']) dbgHeaders['X-Api-Key'] = '***'
    console.info('[Apollo DEBUG] →', { url: APOLLO_URL, payload, headers: dbgHeaders })
  }

  try {
    let resp = await call(buildHeaders())

    // Retry once on 401/403 with OAuth refresh
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
        { error: `Apollo error: ${resp.status} ${resp.statusText}`, details: rawText.slice(0, 2000) },
        { status: resp.status || 400 },
      )
    }

    let data: any = {}
    try { data = rawText ? JSON.parse(rawText) : {} } catch { data = {} }

    const arr: any[] = Array.isArray(data?.contacts)
      ? data.contacts
      : Array.isArray(data?.people)
      ? data.people
      : []

    const people = arr.map((p: any) => {
      // name
      let name: string | null = null
      if (typeof p?.name === 'string' && p.name.trim()) {
        name = p.name.trim()
      } else {
        const first = typeof p?.first_name === 'string' ? p.first_name.trim() : ''
        const last  = typeof p?.last_name  === 'string' ? p.last_name.trim()  : ''
        const joined = [first, last].filter(Boolean).join(' ').trim()
        name = joined || null
      }

      // company
      let company: string | null = null
      if (typeof p?.organization?.name === 'string' && p.organization.name.trim()) {
        company = p.organization.name.trim()
      } else if (Array.isArray(p?.employment_history) && p.employment_history.length > 0) {
        const orgName = p.employment_history[0]?.organization_name
        company = typeof orgName === 'string' && orgName.trim() ? orgName.trim() : null
      }

      // location (wrap ?? when mixing with ||)
      const location =
        (p?.location?.name ??
          [p?.city, p?.state, p?.country].filter(Boolean).join(', ')) ||
        null

      // linkedin
      const linkedin_url =
        typeof p?.linkedin_url === 'string' && p.linkedin_url ? p.linkedin_url : null

      // auto score (cover common keys)
      const autoScore =
        typeof p?.people_auto_score === 'number'
          ? p.people_auto_score
          : typeof p?.auto_score === 'number'
          ? p.auto_score
          : null

      return {
        id: p?.id ?? '',
        name,
        company,
        location,
        linkedin_url,
        autoScore,
      }
    })

    // Sort by Auto-Score desc defensively and cap to 25
    people.sort((a, b) => (b.autoScore ?? 0) - (a.autoScore ?? 0))
    return NextResponse.json({ people: people.slice(0, 25) })
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

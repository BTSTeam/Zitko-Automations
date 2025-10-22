// app/api/apollo/people-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

/**
 * Expected shape of the search request body.  All fields are optional.
 * Supports both legacy keys (title, location, keywords, seniorities, emailStatus)
 * and Apollo-style keys (personTitles, personLocations, qOrganizationKeywordTags,
 * personSeniorities, personDepartmentOrSubdepartments, contactEmailStatus).
 */
type SearchBody = {
  // legacy
  title?: string | string[]
  location?: string | string[]
  keywords?: string
  domains?: string | string[]
  seniorities?: string | string[]
  emailStatus?: string | string[]
  page?: number
  perPage?: number

  // Apollo-style
  personTitles?: string[] | string
  personLocations?: string[] | string
  qOrganizationKeywordTags?: string[] | string
  includedOrganizationKeywordFields?: string[] | string
  personSeniorities?: string[] | string
  personDepartmentOrSubdepartments?: string[] | string
  contactEmailStatus?: string[] | string
  sortByField?: string
  sortAscending?: boolean
}

/** Convert comma-separated strings or arrays to an array of trimmed strings. */
function toArray(value?: string | string[]): string[] {
  if (!value) return []
  return Array.isArray(value)
    ? value.map((s) => s.trim()).filter(Boolean)
    : value.split(',').map((s) => s.trim()).filter(Boolean)
}

const APOLLO_URL = 'https://api.apollo.io/api/v1/mixed_people/search'

/**
 * Handle POST /api/apollo/people-search
 * Builds a JSON payload based on user filters and proxies it to the Apollo API.
 */
export async function POST(req: NextRequest) {
  const DEBUG = (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true'

  // Parse body and normalise fields
  let body: SearchBody = {}
  try {
    body = (await req.json()) as SearchBody
  } catch {
    body = {}
  }

  // --- Gather filters from BOTH legacy and Apollo-style keys ---

  // Titles
  const titles = [
    ...toArray(body.title as any),
    ...toArray(body.personTitles as any),
  ]

  // Locations
  const locations = [
    ...toArray(body.location as any),
    ...toArray(body.personLocations as any),
  ]

  // Seniorities
  const seniorities = [
    ...toArray(body.seniorities as any),
    ...toArray(body.personSeniorities as any),
  ]

  // Departments / subdepartments
  const departments = toArray(body.personDepartmentOrSubdepartments as any)

  // Organization keyword tags (Apollo doc)
  const orgKeywordTags = toArray(body.qOrganizationKeywordTags as any)

  // Legacy "keywords" (q_keywords)
  const freeKeywords = (body.keywords ?? '').trim()

  // Email status (legacy and Apollo-style)
  const emailStatusArr = [
    ...toArray(body.emailStatus as any),
    ...toArray(body.contactEmailStatus as any),
  ]

  // Optional domains (legacy)
  const domains = toArray(body.domains as any)

  // Pagination (we hard-cap to 25 per your requirements)
  const page = Number.isFinite(body.page) && (body.page as number) > 0 ? (body.page as number) : 1
  const perPage = 25

  // Sorting (try to request auto-score order from Apollo)
  const sortByField = body.sortByField || 'people_auto_score'
  const sortAscending = typeof body.sortAscending === 'boolean' ? body.sortAscending : false

  // Build the JSON payload for Apollo
  const payload: Record<string, any> = {
    page,
    per_page: perPage,
    sort_by_field: sortByField,
    sort_ascending: sortAscending,
  }

  if (titles.length > 0) payload.person_titles = titles
  if (locations.length > 0) payload.person_locations = locations
  if (seniorities.length > 0) payload.person_seniorities = seniorities
  if (departments.length > 0) payload.person_department_or_subdepartments = departments

  if (orgKeywordTags.length > 0) {
    payload.q_organization_keyword_tags = orgKeywordTags
    // caller may pass this; default to tags+name to match your example URL
    const included = toArray(body.includedOrganizationKeywordFields as any)
    payload.included_organization_keyword_fields = included.length ? included : ['tags', 'name']
  }

  if (domains.length > 0) payload.q_organization_domains_list = domains

  if (emailStatusArr.length > 0) payload.contact_email_status = emailStatusArr

  if (freeKeywords) payload.q_keywords = freeKeywords

  // Resolve auth: prefer OAuth bearer, otherwise X-Api-Key fallback
  const session = await getSession()
  const userKey = session.user?.email || session.sessionId || ''
  let accessToken = session.tokens?.apolloAccessToken
  const apiKey = process.env.APOLLO_API_KEY

  async function call(headers: Record<string, string>) {
    return fetch(APOLLO_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
  }

  function buildHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    }
    if (accessToken) {
      h['Authorization'] = `Bearer ${accessToken}`
    } else if (apiKey) {
      h['X-Api-Key'] = apiKey
    }
    return h
  }

  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: 'Not authenticated: no Apollo OAuth token or APOLLO_API_KEY present' },
      { status: 401 },
    )
  }

  if (DEBUG) {
    const dbgHeaders = { ...buildHeaders() }
    if (dbgHeaders['Authorization']) dbgHeaders['Authorization'] = 'Bearer ***'
    if (dbgHeaders['X-Api-Key']) dbgHeaders['X-Api-Key'] = '***'
    console.info('[Apollo DEBUG] Outbound request → Apollo', {
      url: APOLLO_URL,
      payload,
      headers: dbgHeaders,
    })
  }

  try {
    // First attempt
    let resp = await call(buildHeaders())

    // If OAuth was used and we got 401/403, try refresh then retry once
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

    // Parse Apollo response; it may contain either `contacts` or `people`
    let data: any = {}
    try {
      data = rawText ? JSON.parse(rawText) : {}
    } catch {
      data = {}
    }

    const arr: any[] = Array.isArray(data?.contacts)
      ? data.contacts
      : Array.isArray(data?.people)
        ? data.people
        : []

    // Normalise to expected fields for the UI
    const people = arr.map((p: any) => {
      // name
      let name: string | null = null
      if (typeof p?.name === 'string' && p.name.trim()) {
        name = p.name.trim()
      } else {
        const first = typeof p?.first_name === 'string' ? p.first_name.trim() : ''
        const last = typeof p?.last_name === 'string' ? p.last_name.trim() : ''
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

      // location (try a few common shapes)
      const loc =
      (p?.location?.name ??
        [p?.city, p?.state, p?.country].filter(Boolean).join(', ')) ||
      null

      // linkedin
      const linkedin_url =
        typeof p?.linkedin_url === 'string' && p.linkedin_url ? p.linkedin_url : null

      // auto score (different payloads use different keys)
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
        location: loc,
        linkedin_url,
        autoScore,
      }
    })

    // Defensive server-side sort & cap
    people.sort((a, b) => (b.autoScore ?? 0) - (a.autoScore ?? 0))
    const capped = people.slice(0, 25)

    return NextResponse.json({ people: capped })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error during Apollo request', details: String(err) },
      { status: 500 },
    )
  }
}

/**
 * Provide a clear message for unsupported GET requests.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/people-search with a JSON body.' },
    { status: 405 },
  )
}

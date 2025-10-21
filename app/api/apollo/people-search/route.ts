// app/api/apollo/people-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

/**
 * Expected shape of the search request body.  All fields are optional.
 */
type SearchBody = {
  title?: string | string[]
  location?: string | string[]
  keywords?: string
  domains?: string | string[]
  seniorities?: string | string[]
  emailStatus?: string | string[]
  page?: number
  perPage?: number
}

/**
 * Convert comma-separated strings or arrays to an array of trimmed strings.
 */
function toArray(value?: string | string[]): string[] {
  if (!value) return []
  return Array.isArray(value)
    ? value.map(s => s.trim()).filter(Boolean)
    : value.split(',').map(s => s.trim()).filter(Boolean)
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

  const titles = toArray(body.title)
  const locations = toArray(body.location)
  const domains = toArray(body.domains)
  const seniorities = toArray(body.seniorities)
  const emailStatusArr = Array.isArray(body.emailStatus)
    ? body.emailStatus.map(s => s.trim()).filter(Boolean)
    : toArray(body.emailStatus)
  const keywords = (body.keywords ?? '').trim()
  const page = Number.isFinite(body.page) && body.page! > 0 ? body.page! : 1
  const perPageRaw =
    Number.isFinite(body.perPage) && body.perPage! > 0 ? body.perPage! : 100
  const perPage = Math.min(perPageRaw, 100)

  // Build the JSON payload for Apollo
  const payload: Record<string, any> = { page, per_page: perPage }
  if (titles.length > 0) payload.person_titles = titles
  if (locations.length > 0) payload.person_locations = locations
  if (domains.length > 0) payload.q_organization_domains_list = domains
  if (seniorities.length > 0) payload.person_seniorities = seniorities
  if (emailStatusArr.length > 0) payload.contact_email_status = emailStatusArr
  if (keywords) payload.q_keywords = keywords

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

    // Normalise to expected fields
    const people = arr.map((p: any) => {
      let name: string | null = null
      if (typeof p?.name === 'string' && p.name.trim()) {
        name = p.name.trim()
      } else {
        const first = typeof p?.first_name === 'string' ? p.first_name.trim() : ''
        const last = typeof p?.last_name === 'string' ? p.last_name.trim() : ''
        const joined = [first, last].filter(Boolean).join(' ').trim()
        name = joined || null
      }

      let company: string | null = null
      if (typeof p?.organization?.name === 'string' && p.organization.name.trim()) {
        company = p.organization.name.trim()
      } else if (Array.isArray(p?.employment_history) && p.employment_history.length > 0) {
        const orgName = p.employment_history[0]?.organization_name
        company = typeof orgName === 'string' && orgName.trim() ? orgName.trim() : null
      }

      const title = typeof p?.title === 'string' && p.title.trim() ? p.title.trim() : null
      const linkedin_url =
        typeof p?.linkedin_url === 'string' && p.linkedin_url ? p.linkedin_url : null

      return {
        id: p?.id ?? '',
        name,
        title,
        company,
        linkedin_url,
      }
    })

    return NextResponse.json({ people })
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

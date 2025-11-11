// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

/**
 * Apollo "mixed companies" search
 * We build a query string with all filters and POST an empty JSON body.
 * Endpoint: https://api.apollo.io/api/v1/mixed_companies/search
 */
const APOLLO_URL = 'https://api.apollo.io/api/v1/mixed_companies/search'

type InBody = {
  // UI → organization_locations[]
  locations?: string[] | string

  // UI → q_organization_keyword_tags[]  (array of strings)
  keywords?: string[] | string

  // UI → organization_num_employees_ranges[] (each item formatted "MIN,MAX", e.g. "1,100")
  employeeRanges?: string[] | string

  // Optional fallbacks to build a single range if employeeRanges not supplied
  employeesMin?: number | string | null
  employeesMax?: number | string | null

  // UI → Active Job Listings (Tick Box)
  activeJobsOnly?: boolean

  // UI → Days (used only when activeJobsOnly = true)
  activeJobsDays?: number | string | null

  // UI → q_organization_job_titles[] (array of strings)
  jobTitles?: string[] | string

  // Pagination
  page?: number | string
  per_page?: number | string
}

/** ---------- helpers ---------- */
function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean)
  return v
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function toPosInt(v: unknown, fallback: number): number {
  const n =
    typeof v === 'string'
      ? parseInt(v, 10)
      : typeof v === 'number'
        ? Math.floor(v)
        : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}
function dateNDaysAgoYMD(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return ymd(d)
}
function todayYMD(): string {
  return ymd(new Date())
}

/** Hard-coded CRM technologies (excluded) → currently_not_using_any_of_technology_uids[] */
const CRM_TECH_NAMES = [
  'Vincere',
  'Bullhorn',
  'TrackerRMS',
  'PC Recruiter',
  'Catsone',
  'Zoho Recruit',
  'JobAdder',
  'Crelate',
  'Avionte',
]
const CRM_TECH_UIDS = CRM_TECH_NAMES.map(n => n.trim().toLowerCase().replace(/\s+/g, '_'))

export async function POST(req: NextRequest) {
  const DEBUG = (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true'

  let inBody: InBody = {}
  try {
    inBody = (await req.json()) as InBody
  } catch {}

  // ---------- Map UI → Apollo params ----------
  const organization_locations = toArray(inBody.locations)

  // Employees
  const employeeRangesIncoming = toArray(inBody.employeeRanges)
  const minNum =
    inBody.employeesMin === '' || inBody.employeesMin == null
      ? null
      : Number(inBody.employeesMin)
  const maxNum =
    inBody.employeesMax === '' || inBody.employeesMax == null
      ? null
      : Number(inBody.employeesMax)

  const organization_num_employees_ranges: string[] = [...employeeRangesIncoming]
  if (
    !organization_num_employees_ranges.length &&
    (typeof minNum === 'number' || typeof maxNum === 'number')
  ) {
    const min = Number.isFinite(minNum) ? String(minNum) : ''
    const max = Number.isFinite(maxNum) ? String(maxNum) : ''
    const merged = [min, max].filter(Boolean).join(',')
    if (merged) organization_num_employees_ranges.push(merged)
  }

  // Job titles
  const q_organization_job_titles = toArray(inBody.jobTitles)

  // Keywords → q_organization_keyword_tags[] (array)
  const q_organization_keyword_tags = toArray(inBody.keywords)

  // Pagination
  const page = toPosInt(inBody.page, 1)
  const per_page = Math.min(50, toPosInt(inBody.per_page, 25)) // allow up to 50 if you want

  // Active Jobs / Days
  const activeJobsOnly = Boolean(inBody.activeJobsOnly)
  const rawDays = inBody.activeJobsDays
  const jobsWindowDays =
    Number.isFinite(Number(rawDays)) && Number(rawDays) > 0
      ? Math.floor(Number(rawDays))
      : null

  // ---------- Auth ----------
  const session = await getSession()
  const userKey = session.user?.email || session.sessionId || ''
  let accessToken: string | undefined = session.tokens?.apolloAccessToken || undefined
  const apiKey: string | undefined = process.env.APOLLO_API_KEY || undefined

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

  // ---------- Build query string ----------
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('per_page', String(per_page))
  params.set('include_similar_titles', 'true')

  // Locations
  organization_locations.forEach(loc => params.append('organization_locations[]', loc))

  // Employee ranges
  organization_num_employees_ranges.forEach(r => params.append('organization_num_employees_ranges[]', r))

  // Job titles
  q_organization_job_titles.forEach(t => params.append('q_organization_job_titles[]', t))

  // Keywords (tags)
  q_organization_keyword_tags.forEach(tag => params.append('q_organization_keyword_tags[]', tag))

  // Excluded CRMs
  CRM_TECH_UIDS.forEach(uid => params.append('currently_not_using_any_of_technology_uids[]', uid))

  // Active Job Listings logic
  if (activeJobsOnly) {
    params.append('organization_num_jobs_range[min]', '1')
    params.append('organization_num_jobs_range[max]', '100')
    if (jobsWindowDays != null) {
      params.append('organization_job_posted_at_range[min]', dateNDaysAgoYMD(jobsWindowDays))
      params.append('organization_job_posted_at_range[max]', todayYMD())
    }
  }

  const urlWithQs = `${APOLLO_URL}?${params.toString()}`
  const call = (headers: Record<string, string>) =>
    fetch(urlWithQs, { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-store' })

  if (DEBUG) {
    const dbgHeaders = { ...buildHeaders() }
    if (dbgHeaders.Authorization) dbgHeaders.Authorization = 'Bearer ***'
    if (dbgHeaders['X-Api-Key']) dbgHeaders['X-Api-Key'] = '***'
    console.info('[Apollo DEBUG company-search] →', { url: urlWithQs, headers: dbgHeaders })
  }

  // ---------- Call Apollo ----------
  try {
    let resp = await call(buildHeaders())

    // token refresh on 401/403 if using OAuth
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
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        data = {}
      }
    }

    // Companies can appear under different keys depending on the endpoint/shape
    const arr: any[] = Array.isArray(data?.organizations)
      ? data.organizations
      : Array.isArray(data?.companies)
        ? data.companies
        : []

    // ---------- Normalize for UI (name, location, linkedin, website) ----------
    const companies = arr.map((o: any) => {
      const id = (o?.id ?? o?._id ?? '').toString()
      const name =
        (o?.name && String(o.name).trim()) ||
        (o?.organization && typeof o.organization.name === 'string' && o.organization.name.trim()) ||
        null

      const website_url =
        (typeof o?.website_url === 'string' && o.website_url) ||
        (typeof o?.domain === 'string' && o.domain ? `https://${o.domain}` : null) ||
        null

      const linkedin_url =
        (typeof o?.linkedin_url === 'string' && o.linkedin_url) ||
        (typeof o?.linkedin_profile_url === 'string' && o.linkedin_profile_url) ||
        null

      const exact_location =
        (typeof o?.exact_location === 'string' && o.exact_location.trim()) ||
        (typeof o?.location === 'string' && o.location.trim()) ||
        null

      const city =
        (typeof o?.city === 'string' && o.city) ||
        (typeof o?.location_city === 'string' && o.location_city) ||
        null

      const state =
        (typeof o?.state === 'string' && o.state) ||
        (typeof o?.location_state === 'string' && o.location_state) ||
        null

      const country =
        (typeof o?.country === 'string' && o.country) ||
        (typeof o?.location_country === 'string' && o.location_country) ||
        null

      const location =
        exact_location ||
        [city, state, country].filter(Boolean).join(', ') ||
        null

      const short_description =
        (typeof o?.short_description === 'string' && o.short_description) ||
        (typeof o?.summary === 'string' && o.summary) ||
        null

      return {
        id,
        name,
        location,
        website_url,
        linkedin_url,
        short_description,
        raw: o, // keep for debugging/next steps
      }
    })

    return NextResponse.json({
      meta: { page, per_page, count: companies.length },
      pagination: data?.pagination ?? { page, per_page },
      breadcrumbs: data?.breadcrumbs ?? [],
      companies,
      apollo: data,
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
    { error: 'Use POST /api/apollo/company-search with a JSON body.' },
    { status: 405 },
  )
}

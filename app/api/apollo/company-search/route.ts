// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_COMPANY_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_companies/search'
const APOLLO_PEOPLE_SEARCH_URL  = 'https://api.apollo.io/api/v1/mixed_people/search'
const APOLLO_NEWS_SEARCH_URL    = 'https://api.apollo.io/api/v1/news_articles/search'
const APOLLO_ORG_GET_URL        = (id: string) => `https://api.apollo.io/api/v1/organizations/${id}`
const APOLLO_ORG_JOBS_URL       = (id: string) =>
  `https://api.apollo.io/api/v1/organizations/${encodeURIComponent(id)}/job_postings?page=1&per_page=10`

/* ------------------------------- utils -------------------------------- */
function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map((s) => s.trim()).filter(Boolean)
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}
function buildQS(params: Record<string, string[] | string>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x))
    else if (v !== undefined && v !== null && String(v).length) p.append(k, String(v))
  }
  return p.toString()
}

// YYYY-MM-DD (UTC) — Apollo date filters prefer date-only
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function dateNDaysAgoYMD(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return ymd(d)
}
function todayYMD(): string {
  return ymd(new Date())
}

/* --------------------------------- API --------------------------------- */
export async function POST(req: NextRequest) {
  // ---- input ----
  let inBody: {
    locations?: string[] | string
    keywords?: string[] | string

    // legacy ranges (still supported)
    employeeRanges?: string[] | string

    // numeric min/max employees (preferred)
    employeesMin?: number | string | null
    employeesMax?: number | string | null

    // if true, constrain org search to companies with active jobs in the last N days
    activeJobsOnly?: boolean
    // number of days for the org search window (UI example “30”)
    activeJobsWindowDays?: number | string | null

    // optional filter by job titles when searching orgs
    q_organization_job_titles?: string[] | string

    page?: number | string
    per_page?: number | string
  } = {}

  try {
    inBody = (await req.json()) || {}
  } catch {}

  const locations       = toArray(inBody.locations)
  const tags            = toArray(inBody.keywords)
  const employeeRanges  = toArray(inBody.employeeRanges)
  const jobTitleFilters = toArray(inBody.q_organization_job_titles)

  // numeric min/max employees
  const employeesMinNum =
    inBody.employeesMin === '' || inBody.employeesMin == null ? null : Number(inBody.employeesMin)
  const employeesMaxNum =
    inBody.employeesMax === '' || inBody.employeesMax == null ? null : Number(inBody.employeesMax)

  const activeJobsOnly = Boolean(inBody.activeJobsOnly)
  // parse days window, default 30 if not provided
  const activeJobsWindowDays = (() => {
    const n = Number(inBody.activeJobsWindowDays)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30
  })()

  const page     = Math.max(1, parseInt(String(inBody.page ?? '1'), 10) || 1)
  const per_page = Math.max(1, Math.min(25, parseInt(String(inBody.per_page ?? '25'), 10) || 25))

  // ---- auth ----
  const session   = await getSession()
  const userKey   = session.user?.email || session.sessionId || ''
  let accessToken = session.tokens?.apolloAccessToken
  const apiKey    = process.env.APOLLO_API_KEY

  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: 'Not authenticated: missing Apollo OAuth token or APOLLO_API_KEY' },
      { status: 401 },
    )
  }

  // Important: search endpoints vs job postings have different header tolerance.
  // - search (POST): X-Api-Key works best (unless OAuth token present)
  // - jobs   (GET) : prefers Authorization: Bearer <token> (keep X-Api-Key too)
  const buildHeaders = (kind: 'search' | 'jobs' = 'search'): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    }
    if (accessToken) {
      h.Authorization = `Bearer ${accessToken}`
    } else if (apiKey) {
      if (kind === 'jobs') {
        h.Authorization = `Bearer ${apiKey}`
        h['X-Api-Key'] = apiKey
      } else {
        h['X-Api-Key'] = apiKey
      }
    }
    return h
  }

  // POST helper with retry on token refresh (Apollo POST search endpoints)
  const postWithRetry = async (url: string) => {
    const call = (headers: Record<string, string>) =>
      fetch(url, { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-store' })

    let resp = await call(buildHeaders('search'))
    if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        accessToken = s2.tokens?.apolloAccessToken
        resp = await call(buildHeaders('search'))
      }
    }
    return resp
  }

  /* ---------------------- 1) Primary Organization Search ---------------------- */
  const companyQS: Record<string, string[] | string> = {
    page: String(page),
    per_page: String(per_page),
  }

  // locations
  locations.forEach((loc) => {
    companyQS['organization_locations[]'] =
      (companyQS['organization_locations[]'] as string[] | undefined)?.concat(loc) || [loc]
  })

  // merge user keywords + hard-coded industry keywords (keeps your previous behaviour)
  const hardcoded = ['Security & Investigations']
  const mergedTags = Array.from(new Set([...(tags || []), ...hardcoded]))
  mergedTags.forEach((tag) => {
    companyQS['q_organization_keyword_tags[]'] =
      (companyQS['q_organization_keyword_tags[]'] as string[] | undefined)?.concat(tag) || [tag]
  })

  // Employees (preferred numeric min/max)
  if (typeof employeesMinNum === 'number') {
    companyQS['organization_num_employees_range[min]'] = String(employeesMinNum)
  }
  if (typeof employeesMaxNum === 'number') {
    companyQS['organization_num_employees_range[max]'] = String(employeesMaxNum)
  }

  // Back-compat: accept discrete ranges array if UI still sends it
  if (employeeRanges.length) {
    companyQS['organization_num_employees_ranges[]'] = employeeRanges
  }

  // ✅ Active Job Listings window ONLY on organization search (YYYY-MM-DD)
  if (activeJobsOnly) {
    companyQS['organization_num_jobs_range[min]'] = '1'
    companyQS['organization_job_posted_at_range[min]'] = dateNDaysAgoYMD(activeJobsWindowDays)
    companyQS['organization_job_posted_at_range[max]'] = todayYMD()
  }

  // Optional filter by specific active job titles (chips)
  if (jobTitleFilters.length) {
    companyQS['q_organization_job_titles[]'] = jobTitleFilters
  }

  const companySearchUrl = `${APOLLO_COMPANY_SEARCH_URL}?${buildQS(companyQS)}`
  const compResp = await postWithRetry(companySearchUrl)
  const compRaw  = await compResp.text()

  if (!compResp.ok) {
    return NextResponse.json(
      { error: `Apollo company search error: ${compResp.status} ${compResp.statusText}`, details: compRaw?.slice(0, 2000) },
      { status: compResp.status || 400 },
    )
  }

  let compData: any = {}
  try { compData = compRaw ? JSON.parse(compRaw) : {} } catch {}
  const companies: any[] = Array.isArray(compData?.organizations) ? compData.organizations : []

  if (!companies.length) {
    return NextResponse.json({ companies: [], page, per_page })
  }

  /* --------------------------- 2) Enrich each org ---------------------------- */
  const published_after = dateNDaysAgoYMD(90) // news window

  const enriched = await Promise.all(
    companies.map(async (c) => {
      const orgId = c?.id
      const base: any = {
        id: orgId,
        name: c?.name ?? null,
        website_url: c?.website_url ?? null,
        linkedin_url: c?.linkedin_url ?? null,
        exact_location: c?.location ?? null, // may be overwritten by city/state
        city: null as string | null,
        state: null as string | null,
        short_description: null as string | null,

        job_postings: [] as any[],
        hiring_people: [] as any[],
        news_articles: [] as any[],
      }

      // 2a) Org details (city, state, short_description)
      try {
        const orgResp = await fetch(APOLLO_ORG_GET_URL(orgId), {
          method: 'GET',
          headers: buildHeaders('search'),
          cache: 'no-store',
        })
        const orgRaw = await orgResp.text()
        if (orgResp.ok) {
          let org: any = {}
          try { org = orgRaw ? JSON.parse(orgRaw) : {} } catch {}
          const o = org?.organization || {}
          base.city = (o?.city ?? null)
          base.state = (o?.state ?? null)
          base.short_description = (o?.short_description ?? null)
          if ((base.city || base.state) && !base.exact_location) {
            base.exact_location = [base.city, base.state].filter(Boolean).join(', ')
          }
        }
      } catch {}

      // 2b) Organization Job Postings (current postings; no date filter here)
      try {
      const jobsResp = await fetch(APOLLO_ORG_JOBS_URL(orgId), {
        method: 'GET',
        headers: buildHeaders('search'), // identical headers to Organization fetch
        cache: 'no-store',
      })
      const jobsRaw = await jobsResp.text()
    
      if (jobsResp.ok) {
        let jobs: any = {}
        try { jobs = jobsRaw ? JSON.parse(jobsRaw) : {} } catch {}
        base.job_postings = Array.isArray(jobs?.job_postings) ? jobs.job_postings : []
      } else {
        base.job_postings = []
        ;(base as any).job_postings_error = {
          status: jobsResp.status,
          statusText: jobsResp.statusText,
          body: jobsRaw.slice(0, 500),
        }
      }
    } catch (err: any) {
      base.job_postings = []
      ;(base as any).job_postings_error = { exception: String(err?.message ?? err) }
    }

      // 2c) Hiring contacts (titles only, include similar)
      try {
        const peopleQS = buildQS({
          'organization_ids[]': [orgId],
          'person_titles[]': [
            'Head of Recruitment',
            'Hiring Manager',
            'Talent Acquisition',
            'Talent Acquisition Manager',
            'Talent Acquisition Lead',
            'Recruitment Manager',
            'Recruiting Manager',
            'Head of Talent',
            'Head of People',
            'People & Talent',
            'Talent Partner',
            'Senior Talent Partner',
            'Recruitment Partner',
          ],
          include_similar_titles: 'true',
          per_page: '10',
        })
        const peopleUrl = `${APOLLO_PEOPLE_SEARCH_URL}?${peopleQS}`
        const hpResp = await postWithRetry(peopleUrl)
        const hpRaw  = await hpResp.text()
        if (hpResp.ok) {
          let hp: any = {}
          try { hp = hpRaw ? JSON.parse(hpRaw) : {} } catch {}
          base.hiring_people =
            Array.isArray(hp?.contacts) ? hp.contacts :
            Array.isArray(hp?.people)   ? hp.people   :
            []
        } else {
          base.hiring_people = []
        }
      } catch {}

      // 2d) News (last 90 days)
      try {
        const newsQS = buildQS({
          'organization_ids[]': [orgId],
          published_after, // YYYY-MM-DD
          per_page: '2',
        })
        const newsUrl  = `${APOLLO_NEWS_SEARCH_URL}?${newsQS}`
        const newsResp = await postWithRetry(newsUrl)
        const newsRaw  = await newsResp.text()
        if (newsResp.ok) {
          let news: any = {}
          try { news = newsRaw ? JSON.parse(newsRaw) : {} } catch {}
          base.news_articles = Array.isArray(news?.news_articles) ? news.news_articles : []
        }
      } catch {}

      return base
    }),
  )

  return NextResponse.json({ companies: enriched, page, per_page })
}

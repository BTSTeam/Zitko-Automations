// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_COMPANY_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_companies/search'
const APOLLO_NEWS_SEARCH_URL    = 'https://api.apollo.io/api/v1/news_articles/search'
const APOLLO_ORG_GET_URL        = (id: string) => `https://api.apollo.io/api/v1/organizations/${id}`

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

// YYYY-MM-DD (UTC)
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
  // ---- debug helpers ----
  const DEBUG =
    (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true' ||
    (req.headers.get('x-debug-apollo') || '').trim() === '1'

  const redactHeaders = (h: Record<string, string>) => {
    const copy: Record<string, string> = { ...h }
    if (copy.Authorization) copy.Authorization = 'Bearer ***'
    if (copy['X-Api-Key']) copy['X-Api-Key'] = '***'
    return copy
  }

  // ---- input ----
  let inBody: {
    locations?: string[] | string
    keywords?: string[] | string
    employeeRanges?: string[] | string
    employeesMin?: number | string | null
    employeesMax?: number | string | null
    activeJobsOnly?: boolean
    /** Legacy support */
    activeJobsDays?: number | string | null
    /** Preferred param */
    activeJobsWindowDays?: number | string | null
    q_organization_job_titles?: string[] | string
    page?: number | string
    per_page?: number | string

    /** recruiter exclusion controls */
    excludeRecruiters?: boolean
    excludeNameContains?: string[] | string
    excludeDomains?: string[] | string
  } = {}

  try {
    inBody = (await req.json()) || {}
  } catch {}

  const locations       = toArray(inBody.locations)
  const tags            = toArray(inBody.keywords)
  const employeeRanges  = toArray(inBody.employeeRanges)
  const jobTitleFilters = toArray(inBody.q_organization_job_titles)

  const employeesMinNum =
    inBody.employeesMin === '' || inBody.employeesMin == null ? null : Number(inBody.employeesMin)
  const employeesMaxNum =
    inBody.employeesMax === '' || inBody.employeesMax == null ? null : Number(inBody.employeesMax)

  const activeJobsOnly = Boolean(inBody.activeJobsOnly)

  // accept legacy 'activeJobsDays' when 'activeJobsWindowDays' is not provided
  const activeJobsWindowDays = (() => {
    const raw = inBody.activeJobsWindowDays ?? inBody.activeJobsDays
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30
  })()

  const page     = Math.max(1, parseInt(String(inBody.page ?? '1'), 10) || 1)
  const per_page = Math.max(1, Math.min(25, parseInt(String(inBody.per_page ?? '25'), 10) || 25))

  // recruiter exclusion inputs
  // Default = TRUE (we want to suppress staffing/recruiters by default)
  const excludeRecruiters   = inBody.excludeRecruiters === false ? false : true
  const excludeNameContains = toArray(inBody.excludeNameContains).map((s) => s.toLowerCase())
  const excludeDomains      = toArray(inBody.excludeDomains).map((s) => s.toLowerCase())

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

  // search/news endpoints are POST; details are GET
  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    }
    if (accessToken) {
      h.Authorization = `Bearer ${accessToken}`
    } else if (apiKey) {
      h['X-Api-Key'] = apiKey
    }
    return h
  }

  // POST helper with retry on token refresh (Apollo POST search endpoints)
  const postWithRetry = async (url: string) => {
    const call = (headers: Record<string, string>) =>
      fetch(url, { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-store' })

    let resp = await call(buildHeaders())
    if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        accessToken = s2.tokens?.apolloAccessToken
        resp = await call(buildHeaders())
      }
    }
    return resp
  }

  /* ---------------------- 1) Primary Organization Search ---------------------- */
  const companyQS: Record<string, string[] | string> = {
    page: String(page),
    per_page: String(per_page),
  }

  locations.forEach((loc) => {
    companyQS['organization_locations[]'] =
      (companyQS['organization_locations[]'] as string[] | undefined)?.concat(loc) || [loc]
  })

  if (tags.length) {
    tags.forEach((tag) => {
      companyQS['q_organization_keyword_tags[]'] =
        (companyQS['q_organization_keyword_tags[]'] as string[] | undefined)?.concat(tag) || [tag]
    })
  }

  if (typeof employeesMinNum === 'number') {
    companyQS['organization_num_employees_range[min]'] = String(employeesMinNum)
  }
  if (typeof employeesMaxNum === 'number') {
    companyQS['organization_num_employees_range[max]'] = String(employeesMaxNum)
  }

  if (employeeRanges.length) {
    companyQS['organization_num_employees_ranges[]'] = employeeRanges
  }

  if (activeJobsOnly) {
    companyQS['organization_num_jobs_range[min]'] = '1'
    companyQS['organization_job_posted_at_range[min]'] = dateNDaysAgoYMD(activeJobsWindowDays)
    companyQS['organization_job_posted_at_range[max]'] = todayYMD()
  }

  if (jobTitleFilters.length) {
    companyQS['q_organization_job_titles[]'] = jobTitleFilters
  }

  const companySearchUrl = `${APOLLO_COMPANY_SEARCH_URL}?${buildQS(companyQS)}`
  const topLevelDebug: any = DEBUG
    ? {
        companySearchUrl,
        headers: redactHeaders(buildHeaders()),
        activeJobsWindowDays,
        excludeRecruiters,
        excludeNameContains,
        excludeDomains,
      }
    : undefined

  const compResp = await postWithRetry(companySearchUrl)
  const compRaw  = await compResp.text()

  if (!compResp.ok) {
    return NextResponse.json(
      {
        error: `Apollo company search error: ${compResp.status} ${compResp.statusText}`,
        details: compRaw?.slice(0, 2000),
        debug: topLevelDebug,
      },
      { status: compResp.status || 400 },
    )
  }

  let compData: any = {}
  try { compData = compRaw ? JSON.parse(compRaw) : {} } catch {}
  let companies: any[] = Array.isArray(compData?.organizations) ? compData.organizations : []

  if (!companies.length) {
    return NextResponse.json({ companies: [], page, per_page, debug: topLevelDebug })
  }

  /* -------- Strong filter: exclude staffing/recruitment companies ------ */
  const AGENCY_PATTERNS = [
    'recruitment','recruiting','recruiter','staffing','talent','resourcing',
    'headhunt','headhunting','personnel','employment','agency','placement',
    'search firm','executive search','rpo','outsourcing'
  ]
  const AGENCY_INDUSTRY = [
    'Staffing and Recruiting','Recruitment','Employment Services','Human Resources Services'
  ].map(s => s.toLowerCase())

  function isAgencyByText(s?: string | null) {
    const t = String(s || '').toLowerCase()
    return AGENCY_PATTERNS.some((k) => t.includes(k))
  }
  function endsWithAny(host: string, needles: string[]) {
    return needles.some((d) => d && host.endsWith(d))
  }

  const beforeCount = companies.length
  companies = companies.filter((c) => {
    if (!excludeRecruiters) return true

    const name   = c?.name ?? ''
    const site   = c?.website_url ?? ''
    const domain = String(site).replace(/^https?:\/\//, '').split('/')[0].toLowerCase()
    const li     = String(c?.linkedin_url || '').toLowerCase()

    // 1) Name, website, LinkedIn text pattern checks
    if (isAgencyByText(name) || isAgencyByText(site) || isAgencyByText(li)) return false

    // 2) Industry / industry tags (if present in payload)
    const industry        = (c?.industry || c?.organization?.industry || '').toString().toLowerCase()
    const industry_tags   = Array.isArray(c?.industry_tags) ? c.industry_tags : (Array.isArray(c?.organization?.industry_tags) ? c.organization.industry_tags : [])
    const hasAgencySector = (
      (industry && AGENCY_INDUSTRY.some((x) => industry.includes(x))) ||
      (Array.isArray(industry_tags) && industry_tags.some((t: any) => AGENCY_INDUSTRY.some((x) => String(t).toLowerCase().includes(x))))
    )
    if (hasAgencySector) return false

    // 3) Optional explicit exclusions from request
    if (excludeNameContains.length) {
      const lower = String(name).toLowerCase()
      if (excludeNameContains.some((s) => s && lower.includes(s))) return false
    }
    if (excludeDomains.length && domain) {
      if (endsWithAny(domain, excludeDomains)) return false
    }

    return true
  })

  if (!companies.length) {
    return NextResponse.json({
      companies: [],
      page,
      per_page,
      debug: DEBUG ? { ...topLevelDebug, filtered_out: beforeCount } : undefined,
    })
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
        exact_location: c?.location ?? null,
        city: null as string | null,
        state: null as string | null,
        short_description: null as string | null,

        // we no longer fetch these; keep shape minimal
        news_articles: [] as any[],
      }

      // --- Org details (GET)
      try {
        const orgHeaders = buildHeaders()
        const orgResp = await fetch(APOLLO_ORG_GET_URL(orgId), {
          method: 'GET',
          headers: orgHeaders,
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
          if (DEBUG) {
            ;(base as any)._debug = {
              ...(base as any)._debug,
              organization: { url: APOLLO_ORG_GET_URL(orgId), headers: redactHeaders(orgHeaders) },
            }
          }
        }
      } catch {}

      // --- News (POST; last 90 days, 2 items)
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
          if (DEBUG) {
            ;(base as any)._debug = {
              ...(base as any)._debug,
              news: { url: newsUrl, headers: redactHeaders(buildHeaders()) },
            }
          }
        }
      } catch {}

      return base
    }),
  )

  return NextResponse.json({
    companies: enriched,
    page,
    per_page,
    debug: DEBUG ? { ...topLevelDebug, after_filter_count: enriched.length } : undefined,
  })
}

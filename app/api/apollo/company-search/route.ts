// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_COMPANY_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_companies/search' // kept for reference
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
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const val of v) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`)
      }
    } else if (v !== undefined && v !== null && String(v).length) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    }
  }
  return parts.join('&')
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10) }
function dateNDaysAgoYMD(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return ymd(d)
}
function todayYMD(): string { return ymd(new Date()) }

/* --------------------------------- API --------------------------------- */
export async function POST(req: NextRequest) {
  // ---- debug helpers ----
  const redactHeaders = (h: Record<string, string>) => {
    const copy: Record<string, string> = { ...h }
    if (copy.Authorization) copy.Authorization = 'Bearer ***'
    if (copy['X-Api-Key']) copy['X-Api-Key'] = '***'
    return copy
  }

  // Support enabling debug via env, header, or body.debug
  let bodyForDebug: any = {}
  try { bodyForDebug = await req.clone().json() } catch {}
  const DEBUG =
    (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true' ||
    (req.headers.get('x-debug-apollo') || '').trim() === '1' ||
    (typeof bodyForDebug?.debug === 'boolean' ? bodyForDebug.debug : false)

  // Optional feature flags to isolate filters quickly during debugging
  const DISABLE_ATS = (process.env.APOLLO_DISABLE_ATS_EXCLUSION || '').toLowerCase() === 'true'
  const FORCE_EMPTY_KEYWORDS = (process.env.APOLLO_FORCE_EMPTY_QKEYWORDS || '').toLowerCase() === 'true'
  const DISABLE_POSTED_AT = (process.env.APOLLO_DISABLE_POSTED_AT || '').toLowerCase() === 'true'

  // 'search' => identical headers to org fetch; 'jobs' => add Bearer + X-Api-Key (tenant dependent)
  const JOBS_HEADERS_KIND = ((process.env.APOLLO_JOBS_HEADERS_KIND || 'search') as 'search' | 'jobs')

  // ---- input ----
  let inBody: {
    locations?: string[] | string                // -> organization_locations[]
    keywords?: string[] | string                 // -> q_keywords (joined as one string)
    employeeRanges?: string[] | string           // -> organization_num_employees_ranges[] e.g. "1,200"
    employeesMin?: number | string | null        // (optional helper from UI; we convert to "min,max" if provided)
    employeesMax?: number | string | null
    activeJobsOnly?: boolean                     // -> organization_num_jobs_range[min]=1
    q_organization_job_titles?: string[] | string
    page?: number | string
    per_page?: number | string
    activeJobsWindowDays?: number | string | null
    activeJobsDays?: number | string | null
    debug?: boolean
  } = {}

  try {
    inBody = (await req.json()) || {}
  } catch {}

  const locations       = toArray(inBody.locations)
  const keywordChips    = toArray(inBody.keywords)
  const employeeRanges  = toArray(inBody.employeeRanges)
  const jobTitleFilters = toArray(inBody.q_organization_job_titles)
  const activeJobsOnly  = Boolean(inBody.activeJobsOnly)

  // If UI sent min/max only, build a single "min,max" range for organization_num_employees_ranges[]
  const minNum = inBody.employeesMin === '' || inBody.employeesMin == null ? null : Number(inBody.employeesMin)
  const maxNum = inBody.employeesMax === '' || inBody.employeesMax == null ? null : Number(inBody.employeesMax)
  if (employeeRanges.length === 0 && (typeof minNum === 'number' || typeof maxNum === 'number')) {
    const min = Number.isFinite(minNum) ? String(minNum) : ''
    const max = Number.isFinite(maxNum) ? String(maxNum) : ''
    const range = [min, max].filter((x) => x !== '').join(', ')
    if (range) employeeRanges.push(range)
  }

  // Join keywords into a single string for q_keywords (or force empty via flag)
  const q_keywords =
    FORCE_EMPTY_KEYWORDS ? '' :
    (keywordChips.length ? keywordChips.join(', ').trim() : '')

  const page     = Math.max(1, parseInt(String(inBody.page ?? '1'), 10) || 1)
  const per_page = Math.max(1, Math.min(25, parseInt(String(inBody.per_page ?? '25'), 10) || 25))

  const rawDays = (inBody as any).activeJobsWindowDays ?? (inBody as any).activeJobsDays
  const jobsWindowDays =
    Number.isFinite(Number(rawDays)) && Number(rawDays) > 0 ? Math.floor(Number(rawDays)) : null

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

  // search (POST): X-Api-Key works best (unless OAuth token present)
  // jobs   (GET) : some tenants prefer Bearer; we can switch via JOBS_HEADERS_KIND
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

  /* ------------------------ 1) People-first Company Lookup ------------------------ */
  // Hardcoded ATS/tech list to *exclude* recruitment companies:
  const ATS_TECH_NAMES: string[] = [
    'AcquireTM','ADP Applicant Tracking System','Applicant Pro','Ascendify','ATS OnDemand','Avature','Avionte','BambooHR','Bond Adapt','Breezy HR (formerly NimbleHR)','Catsone','Compas (MyCompas)','Cornerstone On Demand','Crelate','Employease','eRecruit','Findly','Gethired','Gild','Greenhouse.io','HealthcareSource','HireBridge','HR Logix','HRMDirect','HRSmart','Hyrell','iCIMS','Indeed Sponsored Ads','Infor (PeopleAnswers)','Interviewstream','JobAdder','JobApp','JobDiva','Jobscore','Jobvite','Kenexa','Kwantek','Lever','Luceo','Lumesse','myStaffingPro','myTalentLink','Newton Software','PC Recruiter','People Matter','PeopleFluent','Resumator','Sendouts','SilkRoad','SmartRecruiters','SmashFly','SuccessFactors (SAP)','TalentEd','Taleo','TMP Worldwide','TrackerRMS','UltiPro','Umantis','Winocular','Workable','Workday Recruit','ZipRecruiter','Zoho Recruit','Vincere','Bullhorn',
  ]
  const ATS_TECH_UIDS = ATS_TECH_NAMES.map(n => n.replace(/\s+/g, '_'))

  // Build mixed_people/search query with org filters so we only get people from the target companies
  const peopleQS: Record<string, string[] | string> = {
    page: String(page),
    per_page: String(per_page),
    include_similar_titles: 'true',
  }

  // Locations -> organization_locations[]
  locations.forEach((loc) => {
    peopleQS['organization_locations[]'] =
      (peopleQS['organization_locations[]'] as string[] | undefined)?.concat(loc) || [loc]
  })

  // Employees -> organization_num_employees_ranges[]
  if (employeeRanges.length) {
    peopleQS['organization_num_employees_ranges[]'] = employeeRanges
  }

  // Active job listings -> organization_num_jobs_range[min]=1 (+ optional posted_at window)
  if (activeJobsOnly) {
    peopleQS['organization_num_jobs_range[min]'] = '1'
    if (jobsWindowDays && !DISABLE_POSTED_AT) {
      peopleQS['organization_job_posted_at_range[min]'] = dateNDaysAgoYMD(jobsWindowDays)
      peopleQS['organization_job_posted_at_range[max]'] = todayYMD()
    }
  }

  // Active job titles -> q_organization_job_titles[]
  if (jobTitleFilters.length) {
    peopleQS['q_organization_job_titles[]'] = jobTitleFilters
  }

  // Keywords -> q_keywords (single string)
  if (q_keywords) {
    peopleQS['q_keywords'] = q_keywords
  }

  // Exclude recruitment companies via "currently_not_using_any_of_technology_uids[]"
  if (!DISABLE_ATS) {
    peopleQS['currently_not_using_any_of_technology_uids[]'] = ATS_TECH_UIDS
  }

  // ---- capture debug BEFORE the call
  const debugBag: any = DEBUG ? {
    inputBody: inBody,
    builtParams: peopleQS,
    finalUrl: `${APOLLO_PEOPLE_SEARCH_URL}?${buildQS(peopleQS)}`,
    headers: redactHeaders(buildHeaders('search')),
  } : undefined

  // ---- perform call and keep raw response in debug
  const peopleSearchUrl = `${APOLLO_PEOPLE_SEARCH_URL}?${buildQS(peopleQS)}`
  const pplResp = await postWithRetry(peopleSearchUrl)
  const pplRaw  = await pplResp.text()

  if (DEBUG) {
    if (debugBag) {
      debugBag.apolloStatus = pplResp.status
      debugBag.apolloOk = pplResp.ok
      debugBag.apolloBodyPreview = (pplRaw || '').slice(0, 2000)
    }
  }

  if (!pplResp.ok) {
    return NextResponse.json(
      {
        error: `Apollo people (company-proxy) search error: ${pplResp.status} ${pplResp.statusText}`,
        details: (pplRaw || '').slice(0, 2000),
        debug: debugBag,
      },
      { status: pplResp.status || 400 },
    )
  }

  // Parse people results and collect unique organization_ids
  let peopleData: any = {}
  try { peopleData = pplRaw ? JSON.parse(pplRaw) : {} } catch {}
  const records: any[] =
    Array.isArray(peopleData?.contacts) ? peopleData.contacts
    : Array.isArray(peopleData?.people) ? peopleData.people
    : []

  const orgIdSet = new Set<string>()
  for (const r of records) {
    const id =
      (r?.organization_id && String(r.organization_id)) ||
      (r?.organization?.id && String(r.organization.id)) ||
      ''
    if (id) orgIdSet.add(id)
  }
  const orgIds = Array.from(orgIdSet)

  if (!orgIds.length) {
    return NextResponse.json({ companies: [], page, per_page, debug: debugBag })
  }

  /* --------------------------- 2) Enrich each org ---------------------------- */
  const published_after = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) // Y-M-D

  const enriched = await Promise.all(
    orgIds.map(async (orgId) => {
      const base: any = {
        id: orgId,
        name: null as string | null,
        website_url: null as string | null,
        linkedin_url: null as string | null,
        exact_location: null as string | null,
        city: null as string | null,
        state: null as string | null,
        short_description: null as string | null,
        job_postings: [] as any[],
        hiring_people: [] as any[],
        news_articles: [] as any[],
      }

      const orgHeaders  = buildHeaders('search')
      const jobsHeaders = buildHeaders(JOBS_HEADERS_KIND)

      // Hiring people panel (optional small set of TA roles)
      const hiringQS = buildQS({
        'organization_ids[]': [orgId],
        'person_titles[]': [
          'Head of Recruitment','Hiring Manager','Talent Acquisition','Talent Acquisition Manager',
          'Talent Acquisition Lead','Recruitment Manager','Recruiting Manager','Head of Talent',
          'Head of People','People & Talent','Talent Partner','Senior Talent Partner','Recruitment Partner',
        ],
        include_similar_titles: 'true',
        per_page: '10',
      })
      const peopleUrl = `${APOLLO_PEOPLE_SEARCH_URL}?${hiringQS}`

      const newsQS = buildQS({
        'organization_ids[]': [orgId],
        published_after,
        per_page: '2',
      })
      const newsUrl = `${APOLLO_NEWS_SEARCH_URL}?${newsQS}`

      const [orgR, jobsR, peopleR, newsR] = await Promise.allSettled([
        // Org details
        fetch(APOLLO_ORG_GET_URL(orgId), {
          method: 'GET',
          headers: orgHeaders,
          cache: 'no-store',
        }).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // Job postings
        fetch(APOLLO_ORG_JOBS_URL(orgId), {
          method: 'GET',
          headers: jobsHeaders,
          cache: 'no-store',
        }).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // Hiring people
        postWithRetry(peopleUrl).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // News
        postWithRetry(newsUrl).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),
      ])

      // --- Org details
      if (orgR.status === 'fulfilled' && orgR.value.ok) {
        try {
          const org = JSON.parse(orgR.value.body || '{}')?.organization || {}
          base.name = org?.name ?? null
          base.website_url = org?.website_url ?? org?.domain ?? null
          base.linkedin_url = org?.linkedin_url ?? null
          base.city = org?.city ?? null
          base.state = org?.state ?? null
          base.short_description = org?.short_description ?? null
          base.exact_location = base.exact_location || [base.city, base.state].filter(Boolean).join(', ') || null
        } catch {}
      }

      // --- Job postings
      if (jobsR.status === 'fulfilled') {
        if (jobsR.value.ok) {
          try {
            const jobs = JSON.parse(jobsR.value.body || '{}')
            base.job_postings = Array.isArray(jobs?.job_postings) ? jobs.job_postings : []
          } catch { base.job_postings = [] }
        } else {
          base.job_postings = []
          ;(base as any).job_postings_error = {
            status: jobsR.value.status,
            body: (jobsR.value.body || '').slice(0, 500),
          }
        }
      }

      // --- Hiring people
      if (peopleR.status === 'fulfilled' && peopleR.value.ok) {
        try {
          const hp = JSON.parse(peopleR.value.body || '{}')
          base.hiring_people =
            Array.isArray(hp?.contacts) ? hp.contacts :
            Array.isArray(hp?.people)   ? hp.people   : []
        } catch { base.hiring_people = [] }
      }

      // --- News
      if (newsR.status === 'fulfilled' && newsR.value.ok) {
        try {
          const news = JSON.parse(newsR.value.body || '{}')
          base.news_articles = Array.isArray(news?.news_articles) ? news.news_articles : []
        } catch { base.news_articles = [] }
      }

      if (DEBUG) {
        ;(base as any)._debug = {
          ...(base as any)._debug,
          details_url: APOLLO_ORG_GET_URL(orgId),
          jobs_url: APOLLO_ORG_JOBS_URL(orgId),
          people_url: peopleUrl,
          news_url: newsUrl,
        }
      }

      return base
    }),
  )

  return NextResponse.json({
    companies: enriched,
    page,
    per_page,
    debug: debugBag,
  })
}

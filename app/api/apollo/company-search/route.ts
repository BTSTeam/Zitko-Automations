// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/search'
const APOLLO_NEWS_SEARCH_URL   = 'https://api.apollo.io/api/v1/news_articles/search'
const APOLLO_ORG_GET_URL       = (id: string) => `https://api.apollo.io/api/v1/organizations/${id}`
const APOLLO_ORG_JOBS_URL      = (id: string) =>
  `https://api.apollo.io/api/v1/organizations/${encodeURIComponent(id)}/job_postings?page=1&per_page=10`

/* ------------------------------- utils -------------------------------- */
function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map((s) => s.trim()).filter(Boolean)
  return String(v).split(',').map((s) => s.trim()).filter(Boolean)
}
function buildQS(params: Record<string, string[] | string>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x))
    else if (v !== undefined && v !== null && String(v).length) p.append(k, String(v))
  }
  return p.toString()
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10) }
function dateNDaysAgoYMD(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return ymd(d)
}
function todayYMD(): string { return ymd(new Date()) }

/* -------------------- tech labels + slug normalisation -------------------- */
const HARD_CODED_TECH_LABELS: string[] = [
  "AcquireTM","ADP Applicant Tracking System","Applicant Pro","Ascendify","ATS OnDemand","Avature",
  "Avionte","BambooHR","Bond Adapt","Breezy HR (formerly NimbleHR)","Catsone","Compas (MyCompas)",
  "Cornerstone On Demand","Crelate","Employease","eRecruit","Findly","Gethired","Gild","Greenhouse.io",
  "HealthcareSource","HireBridge","HR Logix","HRMDirect","HRSmart","Hyrell","iCIMS","Indeed Sponsored Ads",
  "Infor (PeopleAnswers)","Interviewstream","JobAdder","JobApp","JobDiva","Jobscore","Jobvite","Kenexa",
  "Kwantek","Lever","Luceo","Lumesse","myStaffingPro","myTalentLink","Newton Software","PC Recruiter",
  "People Matter","PeopleFluent","Resumator","Sendouts","SilkRoad","SmartRecruiters","SmashFly",
  "SuccessFactors (SAP)","TalentEd","Taleo","TMP Worldwide","TrackerRMS","UltiPro","Umantis","Winocular",
  "Workable","Workday Recruit","ZipRecruiter","Zoho Recruit","Vincere","Bullhorn",
]

// Apollo slug rules: lowercase, underscores for spaces/periods, minimal punctuation.
function toTechSlug(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\(formerly [^)]+\)/g, '')   // remove “(formerly …)”
    .replace(/&/g, ' and ')
    .replace(/[./\s+-]+/g, '_')           // spaces/periods/hyphens → _
    .replace(/[^a-z0-9_]/g, '')           // strip remaining punctuation
    .replace(/_{2,}/g, '_')               // collapse __
    .replace(/^_+|_+$/g, '')              // trim _
}

function normaliseToSlugs(values: string[]): string[] {
  return Array.from(new Set(values.map(v => toTechSlug(v)).filter(Boolean)))
}

/* --------------------------------- API --------------------------------- */
export async function POST(req: NextRequest) {
  const urlObj = new URL(req.url)
  const DEBUG = (urlObj.searchParams.get('debug') === '1') ||
                ((req.headers.get('x-debug-apollo') || '').trim() === '1')

  let body: any = {}
  try { body = await req.json() } catch {}

  const locations      = toArray(body.locations)
  const keywords       = toArray(body.keywords)
  const employeeRanges = toArray(body.employeeRanges) // pre-built "min,max" strings from UI (optional)
  const employeesMin   = body.employeesMin === '' || body.employeesMin == null ? null : Number(body.employeesMin)
  const employeesMax   = body.employeesMax === '' || body.employeesMax == null ? null : Number(body.employeesMax)
  const activeJobsOnly = Boolean(body.activeJobsOnly)

  // Manual jobs window: required when activeJobsOnly is true
  const rawDays = body.activeJobsWindowDays ?? body.activeJobsDays
  const parsedDays = Number.isFinite(Number(rawDays)) ? Math.floor(Number(rawDays)) : NaN
  if (activeJobsOnly && (!parsedDays || parsedDays <= 0)) {
    return NextResponse.json(
      { error: 'activeJobsOnly is true, but no valid activeJobsDays was provided (positive integer required).' },
      { status: 400 },
    )
  }
  const activeJobsWindowDays = activeJobsOnly ? parsedDays : 0

  const page     = Math.max(1, parseInt(String(body.page ?? '1'), 10) || 1)
  const per_page = Math.max(1, Math.min(25, parseInt(String(body.per_page ?? '25'), 10) || 25))

  /* --------------------------- tech exclusion (slugs) --------------------------- */
  // Priority: body.technology_uids[] (names OR slugs) -> env APOLLO_TECH_EXCLUSION_UIDS (comma) -> hardcoded labels
  const techFromBody = Array.isArray(body?.technology_uids) ? body.technology_uids : []
  const techFromEnv = String(process.env.APOLLO_TECH_EXCLUSION_UIDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const techSource = techFromBody.length ? techFromBody
                  : techFromEnv.length  ? techFromEnv
                  : HARD_CODED_TECH_LABELS
  const TECH_UIDS = normaliseToSlugs(techSource)

  if (!TECH_UIDS.length) {
    return NextResponse.json(
      { error: 'No technologies provided for exclusion.' },
      { status: 400 },
    )
  }

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
        // Some tenants appear to expect both headers on this GET
        h.Authorization = `Bearer ${apiKey}`
        h['X-Api-Key'] = apiKey
      } else {
        h['X-Api-Key'] = apiKey
      }
    }
    return h
  }

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

  const debugTop: any = DEBUG ? {
    inputs: {
      locations, keywords, employeesMin, employeesMax, employeeRanges,
      activeJobsOnly, activeJobsWindowDays, page, per_page,
      technology_uids: TECH_UIDS,
    },
  } : undefined

  /* ---------------------- 1) People Search -> collect orgs ---------------------- */
  const baseQS: Record<string, string[] | string> = {
    ...(locations.length ? { 'organization_locations[]': locations } : {}),
    q_keywords: [...keywords, 'Security & Investigations'].filter(Boolean).join(', '),
    'person_seniorities[]': ['owner','founder','c_suite','partner','vp','head','director'],
    // Forced tech exclusion by slugs
    'currently_not_using_any_of_technology_uids[]': TECH_UIDS,
  }

  // ✅ Employee filters:
  // Prefer a single ranges[] entry when both min & max exist, e.g. "1,1000"
  const ranges: string[] = []
  if (employeesMin != null && employeesMax != null) {
    ranges.push(`${employeesMin},${employeesMax}`)
  }
  for (const r of employeeRanges) {
    if (r && typeof r === 'string') ranges.push(r)
  }
  
  if (ranges.length) {
    baseQS['organization_num_employees_ranges[]'] = ranges
  } else {
    if (employeesMin != null) baseQS['organization_num_employees_range[min]'] = String(employeesMin)
    if (employeesMax != null) baseQS['organization_num_employees_range[max]'] = String(employeesMax)
  }

  if (activeJobsOnly) {
    baseQS['organization_num_jobs_range[min]'] = '1'
    baseQS['organization_job_posted_at_range[min]'] = dateNDaysAgoYMD(activeJobsWindowDays)
    baseQS['organization_job_posted_at_range[max]'] = todayYMD()
  }

  const desiredUnique = 20
  const seen = new Set<string>()
  const companies: any[] = []
  const pagesTried: string[] = []

  let curPage = Math.max(1, page)
  const pageSize = 50 // Apollo allows up to 100; 50 is a good balance

  while (companies.length < desiredUnique) {
    const qs = buildQS({ ...baseQS, page: String(curPage), per_page: String(pageSize) })
    const url = `${APOLLO_PEOPLE_SEARCH_URL}?${qs}`
    pagesTried.push(url)

    const resp = await postWithRetry(url)
    const txt  = await resp.text()
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Apollo people search ${resp.status}`, details: txt.slice(0, 2000), debug: DEBUG ? { ...debugTop, pagesTried } : undefined },
        { status: resp.status },
      )
    }

    let data: any = {}
    try { data = JSON.parse(txt || '{}') } catch {}
    const peoplePage = Array.isArray(data?.people) ? data.people :
                       Array.isArray(data?.contacts) ? data.contacts : []
    if (!peoplePage.length) break

    for (const p of peoplePage) {
      const org = p?.organization || {}
      if (!org?.id || seen.has(org.id)) continue
      seen.add(org.id)
      companies.push(org)
      if (companies.length >= desiredUnique) break
    }

    curPage += 1
  }

  if (!companies.length) {
    return NextResponse.json({ companies: [], page, per_page, debug: DEBUG ? { ...debugTop, pagesTried, peopleFound: 0 } : undefined })
  }

  /* --------------------------- 2) Enrich each org ---------------------------- */
  const newsMin = dateNDaysAgoYMD(90)
  const newsMax = todayYMD()

  const enriched = await Promise.all(
    companies.map(async (c) => {
      const orgId = c.id
      const base: any = {
        id: orgId,
        name: c.name ?? null,
        website_url: c.website_url ?? null,
        linkedin_url: c.linkedin_url ?? null,
        exact_location: c.location ?? null,
        city: null,
        state: null,
        job_postings: [],
        hiring_people: [],
        news_articles: [],
      }

      const orgHeaders  = buildHeaders('search')
      const jobsHeaders = buildHeaders('jobs')

      const peopleQS = buildQS({
        'organization_ids[]': [orgId],
        'person_titles[]': [
          'Head of Recruitment','Hiring Manager','Talent Acquisition','Talent Acquisition Manager',
          'Talent Acquisition Lead','Recruitment Manager','Recruiting Manager','Head of Talent',
          'Head of People','People & Talent','Talent Partner','Senior Talent Partner','Recruitment Partner',
        ],
        include_similar_titles: 'true',
        per_page: '10',
      })
      const peopleUrl = `${APOLLO_PEOPLE_SEARCH_URL}?${peopleQS}`

      const newsQS = buildQS({
        'organization_ids[]': [orgId],
        'published_at[min]': newsMin,
        'published_at[max]': newsMax,
        per_page: '2',
      })
      const newsUrl = `${APOLLO_NEWS_SEARCH_URL}?${newsQS}`

      const [orgR, jobsR, peopleR, newsR] = await Promise.allSettled([
        fetch(APOLLO_ORG_GET_URL(orgId), { headers: orgHeaders, cache: 'no-store' }),
        fetch(APOLLO_ORG_JOBS_URL(orgId), { headers: jobsHeaders, cache: 'no-store' }),
        postWithRetry(peopleUrl),
        postWithRetry(newsUrl),
      ])

      ;(base as any)._fetch = DEBUG ? {
        org:  orgR.status === 'fulfilled' ? String((orgR.value as any)?.status) : 'rejected',
        jobs: jobsR.status === 'fulfilled' ? String((jobsR.value as any)?.status) : 'rejected',
        ppl:  peopleR.status === 'fulfilled' ? String((peopleR.value as any)?.status) : 'rejected',
        news: newsR.status === 'fulfilled' ? String((newsR.value as any)?.status) : 'rejected',
      } : undefined

      if (orgR.status === 'fulfilled' && orgR.value.ok) {
        try {
          const org = JSON.parse(await orgR.value.text())?.organization || {}
          base.city = org.city ?? null
          base.state = org.state ?? null
          if ((base.city || base.state) && !base.exact_location)
            base.exact_location = [base.city, base.state].filter(Boolean).join(', ')
        } catch {}
      }

      if (jobsR.status === 'fulfilled' && jobsR.value.ok) {
        try {
          const jobs = JSON.parse(await jobsR.value.text() || '{}')
          base.job_postings = Array.isArray(jobs.job_postings) ? jobs.job_postings : []
        } catch {}
      }

      if (peopleR.status === 'fulfilled' && peopleR.value.ok) {
        try {
          const hp = JSON.parse(await peopleR.value.text() || '{}')
          base.hiring_people =
            Array.isArray(hp?.contacts) ? hp.contacts :
            Array.isArray(hp?.people)   ? hp.people   : []
        } catch {}
      }

      if (newsR.status === 'fulfilled' && newsR.value.ok) {
        try {
          const news = JSON.parse(await newsR.value.text() || '{}')
          base.news_articles = Array.isArray(news.news_articles) ? news.news_articles : []
        } catch {}
      }

      return base
    })
  )

  const respObj: any = { companies: enriched.slice(0, 20), page, per_page }
  if (DEBUG) respObj.debug = { ...debugTop, pagesTried, uniqueOrgs: enriched.length }
  return NextResponse.json(respObj)
}

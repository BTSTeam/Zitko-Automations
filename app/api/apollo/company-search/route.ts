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
  let body: any = {}
  try { body = await req.json() } catch {}

  const locations      = toArray(body.locations)
  const keywords       = toArray(body.keywords)
  const employeeRanges = toArray(body.employeeRanges)
  const employeesMin   = Number(body.employeesMin ?? 0) || null
  const employeesMax   = Number(body.employeesMax ?? 0) || null
  const activeJobsOnly = Boolean(body.activeJobsOnly)
  const daysWindowRaw  = body.activeJobsWindowDays ?? body.activeJobsDays
  const activeJobsWindowDays = Number(daysWindowRaw) > 0 ? Number(daysWindowRaw) : 30
  const page     = Math.max(1, parseInt(String(body.page ?? '1'), 10) || 1)
  const per_page = Math.max(1, Math.min(100, parseInt(String(body.per_page ?? '25'), 10) || 25))

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
    if (accessToken) h.Authorization = `Bearer ${accessToken}`
    else if (apiKey) {
      if (kind === 'jobs') {
        h.Authorization = `Bearer ${apiKey}`
        h['X-Api-Key'] = apiKey
      } else h['X-Api-Key'] = apiKey
    }
    return h
  }

  const primaryQS = buildQS(searchParams)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[apollo primary people]', `${APOLLO_PEOPLE_SEARCH_URL}?${primaryQS}`)
  }
  const peopleResp = await postWithRetry(`${APOLLO_PEOPLE_SEARCH_URL}?${primaryQS}`, {})
  
  const postWithRetry = async (url: string, payload: any) => {
    const call = (headers: Record<string, string>) =>
      fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), cache: 'no-store' })

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

  /* ---------------------- 1) Primary People Search ---------------------- */
  const searchParams: Record<string, any> = {
    page,
    per_page,
    'organization_locations[]': locations,
    q_keywords: [...keywords, 'Security & Investigations'].filter(Boolean).join(', '),
    'person_seniorities[]': ['owner','founder','c_suite','partner','vp','head','director'],
  }

  if (employeesMin) searchParams['organization_num_employees_range[min]'] = String(employeesMin)
  if (employeesMax) searchParams['organization_num_employees_range[max]'] = String(employeesMax)
  if (employeeRanges.length)
    searchParams['organization_num_employees_ranges[]'] = employeeRanges

  if (activeJobsOnly) {
    searchParams['organization_num_jobs_range[min]'] = '1'
    searchParams['organization_job_posted_at_range[min]'] = dateNDaysAgoYMD(activeJobsWindowDays)
    searchParams['organization_job_posted_at_range[max]'] = todayYMD()
  }

  const jobTitles = toArray(body.q_organization_job_titles)
  if (activeJobsOnly && jobTitles.length) {
    searchParams['q_organization_job_titles'] = jobTitles
  }

  const primaryQS = buildQS(searchParams)
  const peopleResp = await postWithRetry(`${APOLLO_PEOPLE_SEARCH_URL}?${primaryQS}`, {})
  const raw = await peopleResp.text()
  if (!peopleResp.ok)
    return NextResponse.json({ error: `Apollo people search ${peopleResp.status}`, details: raw.slice(0,2000) }, { status: peopleResp.status })

  let peopleData: any = {}
  try { peopleData = JSON.parse(raw || '{}') } catch {}
  const peopleList = Array.isArray(peopleData?.people) ? peopleData.people :
                     Array.isArray(peopleData?.contacts) ? peopleData.contacts : []

  // Deduplicate orgs
  const seen = new Set<string>()
  const companies = []
  for (const p of peopleList) {
    const org = p?.organization || {}
    if (!org?.id || seen.has(org.id)) continue
    seen.add(org.id)
    companies.push(org)
    if (companies.length >= per_page) break
  }

  if (!companies.length)
    return NextResponse.json({ companies: [], page, per_page })

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
        short_description: null,
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
        postWithRetry(peopleUrl, {}),
        postWithRetry(newsUrl, {}),
      ])

      // Org details
      if (orgR.status === 'fulfilled' && orgR.value.ok) {
        try {
          const org = JSON.parse(await orgR.value.text())?.organization || {}
          base.city = org.city ?? null
          base.state = org.state ?? null
          base.short_description = org.short_description ?? null
          if ((base.city || base.state) && !base.exact_location)
            base.exact_location = [base.city, base.state].filter(Boolean).join(', ')
        } catch {}
      }

      // Jobs
      if (jobsR.status === 'fulfilled' && jobsR.value.ok) {
        try {
          const jobs = JSON.parse(await jobsR.value.text() || '{}')
          base.job_postings = Array.isArray(jobs.job_postings) ? jobs.job_postings : []
        } catch {}
      }

      // Hiring people
      if (peopleR.status === 'fulfilled' && peopleR.value.ok) {
        try {
          const hp = JSON.parse(await peopleR.value.text() || '{}')
          base.hiring_people =
            Array.isArray(hp?.contacts) ? hp.contacts :
            Array.isArray(hp?.people)   ? hp.people   : []
        } catch {}
      }

      // News
      if (newsR.status === 'fulfilled' && newsR.value.ok) {
        try {
          const news = JSON.parse(await newsR.value.text() || '{}')
          base.news_articles = Array.isArray(news.news_articles) ? news.news_articles : []
        } catch {}
      }

      return base
    })
  )

  return NextResponse.json({ companies: enriched, page, per_page })
}

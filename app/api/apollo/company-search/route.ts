// app/api/apollo/company-search/route.ts
//
// Company search using ONLY Apollo's documented filters on the primary call:
//  - organization_locations[]            (array)
//  - q_organization_keyword_tags[]       (array)
// Method: POST with empty JSON body.
//
// Then enrich each company with:
//  - Job postings (GET organizations/{id}/job_postings?per_page=10)
//  - Hiring people (POST mixed_people/search scoped to organization_ids[])
//  - News (POST news_articles/search, last 90 days)
//
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

// Apollo endpoints
const APOLLO_COMPANY_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_companies/search'
const APOLLO_PEOPLE_SEARCH_URL  = 'https://api.apollo.io/api/v1/mixed_people/search'
const APOLLO_NEWS_SEARCH_URL    = 'https://api.apollo.io/api/v1/news_articles/search'

// --- helpers ---
function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean)
  return v.split(',').map(s => s.trim()).filter(Boolean)
}
function buildQS(params: Record<string, string[] | string>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => p.append(k, x))
    else if (v) p.append(k, v)
  }
  return p.toString()
}
function dateNDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]
}

export async function POST(req: NextRequest) {
  // ---- input ----
  let inBody: {
    locations?: string[] | string          // -> organization_locations[]
    keywords?: string[] | string           // -> q_organization_keyword_tags[]
    page?: number | string
    per_page?: number | string
  } = {}
  try { inBody = (await req.json()) || {} } catch {}

  const locations = toArray(inBody.locations)        // e.g. ["London, United Kingdom"]
  const tags      = toArray(inBody.keywords)         // e.g. ["Security","CCTV"]

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

  // POST helper with retry on token refresh
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

  // ---- 1) Primary company search (docs-accurate minimal filters) ----
  const companyQS: Record<string, string[] | string> = {
    page: String(page),
    per_page: String(per_page),
  }
  locations.forEach(loc => {
    companyQS['organization_locations[]'] =
      (companyQS['organization_locations[]'] as string[] | undefined)?.concat(loc) || [loc]
  })
  tags.forEach(tag => {
    companyQS['q_organization_keyword_tags[]'] =
      (companyQS['q_organization_keyword_tags[]'] as string[] | undefined)?.concat(tag) || [tag]
  })

  const companySearchUrl = `${APOLLO_COMPANY_SEARCH_URL}?${buildQS(companyQS)}`
  const compResp = await postWithRetry(companySearchUrl)
  const compRaw  = await compResp.text()

  if (!compResp.ok) {
    return NextResponse.json(
      { error: `Apollo company search error: ${compResp.status} ${compResp.statusText}`, details: compRaw?.slice(0, 2000) },
      { status: compResp.status || 400 }
    )
  }

  let compData: any = {}
  try { compData = compRaw ? JSON.parse(compRaw) : {} } catch {}
  const companies: any[] = Array.isArray(compData?.organizations) ? compData.organizations : []

  // Nothing found → early return (still useful to the UI)
  if (!companies.length) {
    return NextResponse.json({ companies: [], page, per_page })
  }

  // ---- 2) Enrich each company ----
  const published_after = dateNDaysAgo(90)  // ~last 3 months
  const enriched = await Promise.all(
    companies.map(async (c) => {
      const orgId = c?.id
      const base: any = {
        id: orgId,
        name: c?.name ?? null,
        website_url: c?.website_url ?? null,
        linkedin_url: c?.linkedin_url ?? null,
        num_employees: c?.num_employees ?? null,
        exact_location: c?.location ?? null,
        job_postings: [] as any[],
        hiring_people: [] as any[],
        news_articles: [] as any[],
      }

      // 2a) Job postings (Apollo supports GET here)
      try {
        const jobsUrl = `https://api.apollo.io/api/v1/organizations/${orgId}/job_postings?per_page=10`
        const jobsResp = await fetch(jobsUrl, { method: 'GET', headers: buildHeaders(), cache: 'no-store' })
        const jobsRaw  = await jobsResp.text()
        if (jobsResp.ok) {
          let jobs: any = {}
          try { jobs = jobsRaw ? JSON.parse(jobsRaw) : {} } catch {}
          base.job_postings = Array.isArray(jobs?.job_postings) ? jobs.job_postings : []
        }
      } catch { /* ignore per-org failure */ }

      // 2b) Hiring contacts (recruitment personnel)
      try {
        const hpQS = buildQS({
          'organization_ids[]': [orgId],
          // You can expand titles if needed:
          'person_titles[]': ['Hiring Manager', 'Talent Acquisition', 'Head of Recruitment'],
          per_page: '5',
        })
        const hpUrl = `${APOLLO_PEOPLE_SEARCH_URL}?${hpQS}`
        const hpResp = await postWithRetry(hpUrl)
        const hpRaw = await hpResp.text()
        if (hpResp.ok) {
          let hp: any = {}
          try { hp = hpRaw ? JSON.parse(hpRaw) : {} } catch {}
          const arr = Array.isArray(hp?.contacts) ? hp.contacts : Array.isArray(hp?.people) ? hp.people : []
          base.hiring_people = arr
        }
      } catch { /* ignore per-org failure */ }

      // 2c) News articles (last 90 days)
      try {
        const newsQS = buildQS({
          'organization_ids[]': [orgId],
          published_after,
          per_page: '5',
        })
        const newsUrl = `${APOLLO_NEWS_SEARCH_URL}?${newsQS}`
        const newsResp = await postWithRetry(newsUrl)
        const newsRaw  = await newsResp.text()
        if (newsResp.ok) {
          let news: any = {}
          try { news = newsRaw ? JSON.parse(newsRaw) : {} } catch {}
          base.news_articles = Array.isArray(news?.news_articles) ? news.news_articles : []
        }
      } catch { /* ignore per-org failure */ }

      return base
    })
  )

  return NextResponse.json({ companies: enriched, page, per_page })
}

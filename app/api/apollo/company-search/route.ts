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
const APOLLO_ORG_JOBS_URL       = (id: string) => `https://api.apollo.io/api/v1/organizations/${id}/job_postings?per_page=10`

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

  const locations = toArray(inBody.locations)
  const tags      = toArray(inBody.keywords)
  const page      = Math.max(1, parseInt(String(inBody.page ?? '1'), 10) || 1)
  const per_page  = Math.max(1, Math.min(25, parseInt(String(inBody.per_page ?? '25'), 10) || 25))

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

  if (!companies.length) {
    return NextResponse.json({ companies: [], page, per_page })
  }

  // ---- 2) Enrich each company ----
  const published_after = dateNDaysAgo(90)

  const enriched = await Promise.all(companies.map(async (c) => {
    const orgId = c?.id
    const base: any = {
      id: orgId,
      name: c?.name ?? null,
      website_url: c?.website_url ?? null,
      linkedin_url: c?.linkedin_url ?? null,
      // raw location (may be overwritten by city/state)
      exact_location: c?.location ?? null,
      // details we’ll get from org GET:
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
        headers: buildHeaders(),
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

    // 2b) Job postings
    try {
      const jobsResp = await fetch(APOLLO_ORG_JOBS_URL(orgId), {
        method: 'GET',
        headers: buildHeaders(),
        cache: 'no-store',
      })
      const jobsRaw = await jobsResp.text()
      if (jobsResp.ok) {
        let jobs: any = {}
        try { jobs = jobsRaw ? JSON.parse(jobsRaw) : {} } catch {}
        base.job_postings = Array.isArray(jobs?.job_postings) ? jobs.job_postings : []
      }
    } catch {}

    // 2c) Hiring contacts (titles + keywords)
    try {
      const peopleQS = buildQS({
        'organization_ids[]': [orgId],
        // exact/common titles
        'person_titles[]': [
          'Head of Recruitment',
          'Head of Talent',
          'Talent Acquisition',
          'Talent Acquisition Manager',
          'Talent Acquisition Partner',
          'Recruitment Manager',
          'Recruiting Manager',
          'Recruiter',
          'Talent Manager',
          'Hiring Manager',
        ],
        // helpful keyword fallback for varied titles
        'q_person_title_keywords[]': [
          'recruit',
          'recruitment',
          'talent',
          'acquisition',
          'hiring',
        ],
        per_page: '5',
      })
      const peopleUrl = `${APOLLO_PEOPLE_SEARCH_URL}?${peopleQS}`
      const hpResp = await postWithRetry(peopleUrl)
      const hpRaw  = await hpResp.text()
      if (hpResp.ok) {
        let hp: any = {}
        try { hp = hpRaw ? JSON.parse(hpRaw) : {} } catch {}
        base.hiring_people = Array.isArray(hp?.contacts) ? hp.contacts
                            : Array.isArray(hp?.people)   ? hp.people
                            : []
      }
    } catch {}

    // 2d) News (last 90 days)
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
    } catch {}

    return base
  }))

  return NextResponse.json({ companies: enriched, page, per_page })
}

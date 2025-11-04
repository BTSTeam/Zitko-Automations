// app/api/apollo/company-search/route.ts
//
// This route proxies requests to the Apollo `mixed_companies/search` endpoint
// and performs additional lookups per organization for job postings,
// internal recruiters (hiring managers), and recent news articles.  
// It mirrors the people-search route in authentication and response parsing,
// while augmenting results with extra data for the sourcing UI.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

// Apollo base URLs
const APOLLO_COMPANY_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_companies/search'
const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/search'
const APOLLO_NEWS_SEARCH_URL = 'https://api.apollo.io/api/v1/news_articles/search'

// ---------------- Helpers ----------------
function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean)
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

function buildQueryString(params: Record<string, string[] | string>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => search.append(key, v))
    } else if (value) {
      search.append(key, value)
    }
  })
  return search.toString()
}

function dateNDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]
}

// ---------------- Main Route ----------------
export async function POST(req: NextRequest) {
  let body: { locations?: string[] | string; keywords?: string[] | string; page?: number | string; per_page?: number | string } = {}
  try {
    body = (await req.json()) || {}
  } catch {}

  const locations = toArray(body.locations)
  const keywords = toArray(body.keywords)
  const page = Math.max(1, parseInt(String(body.page ?? '1'), 10) || 1)
  const perPage = Math.max(1, Math.min(10, parseInt(String(body.per_page ?? '10'), 10) || 10))

  const companyParams: Record<string, string[] | string> = {
    page: String(page),
    per_page: String(perPage),
  }

  // location & keyword filters
  locations.forEach(loc => {
    companyParams['organization_locations[]'] = companyParams['organization_locations[]']
      ? ([] as string[]).concat(companyParams['organization_locations[]'] as string[], [loc])
      : [loc]
    companyParams['company_locations[]'] = companyParams['company_locations[]']
      ? ([] as string[]).concat(companyParams['company_locations[]'] as string[], [loc])
      : [loc]
  })

  keywords.forEach(kw => {
    companyParams['q_organization_keyword_tags[]'] = companyParams['q_organization_keyword_tags[]']
      ? ([] as string[]).concat(companyParams['q_organization_keyword_tags[]'] as string[], [kw])
      : [kw]
    companyParams['q_keywords[]'] = companyParams['q_keywords[]']
      ? ([] as string[]).concat(companyParams['q_keywords[]'] as string[], [kw])
      : [kw]
  })

  const session = await getSession()
  const userKey = session.user?.email || session.sessionId || ''
  let accessToken = session.tokens?.apolloAccessToken
  const apiKey = process.env.APOLLO_API_KEY

  if (!accessToken && !apiKey) {
    return NextResponse.json({ error: 'Not authenticated: no Apollo OAuth token or API key' }, { status: 401 })
  }

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
    if (apiKey) headers['x-api-key'] = apiKey
    return headers
  }

  // ---- Company Search ----
  const queryString = buildQueryString(companyParams)
  const companyRes = await fetch(`${APOLLO_COMPANY_SEARCH_URL}?${queryString}`, {
    headers: buildHeaders(),
  })

  if (!companyRes.ok) {
    return NextResponse.json({ error: 'Company search failed', status: companyRes.status }, { status: companyRes.status })
  }

  const companyData = await companyRes.json()
  const companies = companyData?.organizations || []

  // ---- For each company, fetch Job Postings, People & News ----
  const enriched = await Promise.all(
    companies.map(async (company: any) => {
      const id = company.id
      const base: any = {
        id,
        name: company.name,
        website_url: company.website_url,
        linkedin_url: company.linkedin_url,
        num_employees: company.num_employees,
        exact_location: company.location,
        job_postings: [],
        hiring_people: [],
        news_articles: [],
      }

      // Job postings
      try {
        const jobsRes = await fetch(`https://api.apollo.io/api/v1/organizations/${id}/job_postings?per_page=10`, {
          headers: buildHeaders(),
        })
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json()
          base.job_postings = jobsData?.job_postings || []
        }
      } catch {}

      // Hiring people
      try {
        const peopleQuery = buildQueryString({
          'organization_ids[]': [id],
          'q_titles[]': ['Hiring Manager', 'Talent Acquisition', 'Head of Recruitment'],
          per_page: '5',
        })
        const peopleRes = await fetch(`${APOLLO_PEOPLE_SEARCH_URL}?${peopleQuery}`, { headers: buildHeaders() })
        if (peopleRes.ok) {
          const peopleData = await peopleRes.json()
          base.hiring_people = peopleData?.people || []
        }
      } catch {}

      // News articles
      try {
        const newsQuery = buildQueryString({
          'organization_ids[]': [id],
          published_after: dateNDaysAgo(90),
          per_page: '5',
        })
        const newsRes = await fetch(`${APOLLO_NEWS_SEARCH_URL}?${newsQuery}`, { headers: buildHeaders() })
        if (newsRes.ok) {
          const newsData = await newsRes.json()
          base.news_articles = newsData?.news_articles || []
        }
      } catch {}

      return base
    })
  )

  return NextResponse.json({ companies: enriched, page, per_page: perPage })
}

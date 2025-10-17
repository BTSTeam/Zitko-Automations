// app/api/sourcing/companies/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type PostBody = {
  locations?: string[]
  keywords?: string[]
  marketSegments?: string[]
  jobPostings?: boolean
  rapidGrowth?: boolean
  limit?: number
}

/* ------------------------------ utils ------------------------------ */

function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
}

function capInt(n: unknown, min = 1, max = 50, def = 50) {
  const x = Math.floor(Number(n))
  if (Number.isFinite(x)) return Math.max(min, Math.min(max, x))
  return def
}

function s(v: any): string {
  return typeof v === 'string' ? v : ''
}

/* ------------------------------ Apollo ----------------------------- */

type ApolloCompany = {
  id?: string
  name?: string
  domain?: string
  primary_domain?: string
  website_url?: string
  linkedin_url?: string
  location?: string
  headquarters_address?: string
  has_job_postings?: boolean
  active_job_postings?: number
  job_postings?: number
  headcount_growth?: any
  growth_signal?: any
}

type ApolloPerson = {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  email?: string
  email_status?: string
  linkedin_url?: string
  organization_name?: string
}

/** Fetch Apollo companies with basic filters applied */
async function apolloCompaniesSearch(input: {
  locations: string[]
  keywords: string[]
  marketSegments: string[]
  jobPostings: boolean
  rapidGrowth: boolean
  limit: number
}) {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing APOLLO_API_KEY' }, { status: 500 })
  }

  const { locations, keywords, marketSegments, jobPostings, rapidGrowth, limit } = input

  const url = 'https://api.apollo.io/api/v1/mixed_companies/search'

  const body: any = {
    page: 1,
    per_page: limit,
    organization_locations: locations.length ? locations : undefined,
    q_keywords: keywords.length ? keywords.join(' ') : undefined,
    display_edu_and_exp: false,
  }

  if (marketSegments.length) {
    const segBlob = marketSegments.join(' ')
    body.q_keywords = body.q_keywords ? `${body.q_keywords} ${segBlob}` : segBlob
  }

  if (jobPostings) body.has_job_postings = true
  if (rapidGrowth) body.use_growth_signal = true

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey, // ✅ required by Apollo
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    return NextResponse.json(
      { error: `Apollo companies search error ${resp.status}: ${t}` },
      { status: 502 },
    )
  }

  const json = (await resp.json()) as any
  const orgs: ApolloCompany[] = Array.isArray(json?.organizations) ? json.organizations : []

  const mapped = orgs.map((o) => ({
    _raw: o,
    id: o.id,
    name: s(o.name),
    domain: s(o.domain || o.primary_domain),
    website_url: s(o.website_url),
    linkedin_url: s(o.linkedin_url),
    location: s(o.location || o.headquarters_address),
    job_postings: Boolean(o.job_postings || o.active_job_postings || o.has_job_postings),
    rapid_growth: Boolean(o.headcount_growth || o.growth_signal),
  }))

  return mapped
}

/** Fetch hiring/TA contacts for a company (by domain), verified email only */
async function apolloPeopleForCompanyDomain(domain: string, limit = 10) {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) return []

  const targetTitles = [
    'Head of Talent',
    'Talent Acquisition',
    'Recruiter',
    'Senior Recruiter',
    'Recruitment',
    'HR',
    'Human Resources',
    'People',
    'Hiring Manager',
    'Talent Partner',
  ]

  const url = 'https://api.apollo.io/api/v1/mixed_people/search'
  const body = {
    page: 1,
    per_page: limit,
    organization_domains: [domain],
    person_titles: targetTitles,
    contact_email_status: ['verified'] as string[],
    display_edu_and_exp: false,
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey, // ✅ required by Apollo
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) return []

  const json = (await resp.json()) as any
  const contacts: any[] = Array.isArray(json?.contacts) ? json.contacts : []

  return contacts.map((c) => ({
    id: c.id,
    name: c.name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim(),
    title: String(c.title ?? ''),
    email: String(c.email ?? ''),
    email_status: String(c.email_status ?? ''),
    linkedin_url: String(c.linkedin_url ?? ''),
    organization_name: String(c.organization_name ?? ''),
  }))
}

/* ---------------------------- Vincere ------------------------------- */

async function ensureVincereToken(): Promise<string | null> {
  try {
    requiredEnv()
  } catch {
    return null
  }
  const session = await getSession()
  let idTok = session?.tokens?.idToken
  if (idTok) return idTok

  const ok = await refreshIdToken('default')
  if (!ok) return null

  const session2 = await getSession()
  return session2?.tokens?.idToken ?? null
}

/** True if Vincere has a company matching name OR domain */
async function vincereCompanyExists(args: {
  name?: string
  domain?: string
  idToken: string
}): Promise<boolean> {
  const { name, domain, idToken } = args
  if (!name && !domain) return false

  const clauses: string[] = []
  if (name) clauses.push(`name:"${name.replace(/"/g, '\\"')}"`)
  if (domain) clauses.push(`domain:"${domain.replace(/"/g, '\\"')}"`)
  const q = clauses.length ? clauses.join(' OR ') : ''

  const u = new URL(
    config.VINCERE_TENANT_API_BASE.replace(/\/$/, '') +
      '/api/v2/company/search/fl=id,name,domain',
  )
  if (q) u.searchParams.set('q', `${q}#`)

  const resp = await fetch(u.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.VINCERE_API_KEY!,
      Authorization: `Bearer ${idToken}`,
      'Cache-Control': 'no-store',
    },
  })

  if (!resp.ok) {
    console.error('Vincere company search error', resp.status, await resp.text().catch(() => ''))
    return false
  }

  const j = (await resp.json()) as any
  const items = Array.isArray(j?.items) ? j.items : []
  return items.length > 0
}

/* ------------------------------ Route ------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody
    const locations = arr(body.locations)
    const keywords = arr(body.keywords)
    const marketSegments = arr(body.marketSegments)
    const jobPostings = Boolean(body.jobPostings)
    const rapidGrowth = Boolean(body.rapidGrowth)
    const limit = capInt(body.limit, 1, 50, 50)

    // 1) Apollo org search
    const apolloRes = await apolloCompaniesSearch({
      locations,
      keywords,
      marketSegments,
      jobPostings,
      rapidGrowth,
      limit,
    })
    if (apolloRes instanceof NextResponse) return apolloRes
    const companies = apolloRes as Array<{
      _raw: ApolloCompany
      id?: string
      name: string
      domain: string
      website_url: string
      linkedin_url: string
      location: string
      job_postings: boolean
      rapid_growth: boolean
    }>

    // 2) Dedupe with Vincere (name OR domain)
    const idToken = await ensureVincereToken()
    if (!idToken) {
      return NextResponse.json(
        {
          results: companies.map((c) => ({ ...c, contacts: [] })),
          deduped: false,
          reason: 'Missing Vincere tokens or env',
        },
        { status: 200 },
      )
    }

    const CONCURRENCY = 5
    let idx = 0
    const deduped: typeof companies = []

    async function worker() {
      while (idx < companies.length) {
        const i = idx++
        const c = companies[i]
        const exists = await vincereCompanyExists({
          name: c.name,
          domain: c.domain,
          idToken,
        })
        if (!exists) deduped.push(c)
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    // 3) Enrich deduped companies with TA/HM contacts (verified emails)
    const enriched = await Promise.all(
      deduped.map(async (c) => {
        const domain = s(c.domain)
        const contacts = domain ? await apolloPeopleForCompanyDomain(domain, 10) : []
        return { ...c, contacts }
      }),
    )

    return NextResponse.json({ results: enriched, deduped: true }, { status: 200 })
  } catch (e: any) {
    console.error('companies route error', e)
    return NextResponse.json(
      { error: e?.message || 'Unknown server error' },
      { status: 500 },
    )
  }
}

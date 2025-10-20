// app/api/sourcing/companies/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

type PostBody = {
  names?: string[]
  locations?: string[]
  keywords?: string[]
  permanent?: boolean
  limit?: number // default max 50
}

/* ----------------------------- Helpers ----------------------------- */

function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
}

function capInt(n: unknown, min = 1, max = 50, def = 50) {
  const x = Math.floor(Number(n))
  if (Number.isFinite(x)) return Math.max(min, Math.min(max, x))
  return def
}

/**
 * Build the Apollo keyword string.
 * Contract ⇒ MUST include IR35 + "Pay Rate"
 * Permanent ⇒ SHOULD exclude them.
 */
function buildApolloKeywordQuery(keywords: string[], permanent: boolean): string | undefined {
  const base = [...keywords].filter(Boolean)

  const IR35 = 'IR35'
  const PAY_RATE = '"Pay Rate"'

  if (permanent === false) {
    if (!base.some(k => /(^|[^a-z])ir35([^a-z]|$)/i.test(k))) base.push(IR35)
    if (!base.some(k => /pay\s*rate/i.test(k))) base.push(PAY_RATE)
  } else {
    base.push(`- ${IR35}`)
    base.push(`- ${PAY_RATE}`)
  }

  const q = base.join(' ').trim()
  return q.length ? q : undefined
}

/* ----------------------------- Apollo ------------------------------ */

type ApolloOrg = {
  id?: string
  name?: string
  website_url?: string
  linkedin_url?: string
  primary_domain?: string
  industry?: string
  city?: string
  state?: string
  country?: string
  num_employees?: number
  annual_revenue?: number
  keywords?: string[]
}

type OrgOut = {
  id?: string
  name: string
  website?: string
  linkedin_url?: string
  industry?: string
  location?: string
  employees?: number
  revenue?: number
  domain?: string
}

/**
 * Calls Apollo Organization search endpoint.
 * https://api.apollo.io/api/v1/organizations/search
 */
async function apolloCompaniesSearchPaged(input: {
  names: string[]
  locations: string[]
  keywords: string[]
  permanent: boolean
  limit: number
}) {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing APOLLO_API_KEY' }, { status: 500 })
  }

  const { names, locations, keywords, permanent } = input
  const per_page = 25
  const pages = [1, 2]
  const url = 'https://api.apollo.io/api/v1/organizations/search'
  const q_keywords = buildApolloKeywordQuery(keywords, permanent)

  const commonBody: Record<string, any> = {
    organization_locations: locations.length ? locations : undefined,
    q_keywords,
    organization_names: names.length ? names : undefined,
    display_org_hq: true,
  }

  const all: ApolloOrg[] = []

  for (const page of pages) {
    const body = { ...commonBody, page, per_page }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return NextResponse.json(
        { error: `Apollo companies search error ${resp.status}: ${text}` },
        { status: 502 },
      )
    }

    const json = (await resp.json()) as any
    const orgs: ApolloOrg[] = Array.isArray(json?.organizations) ? json.organizations : []
    all.push(...orgs)
  }

  // Deduplicate by name + domain (case-insensitive)
  const seen = new Set<string>()
  const deduped = all.filter((c) => {
    const key = `${(c.name || '').trim().toLowerCase()}__${(c.primary_domain || '').trim().toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const mapped: OrgOut[] = deduped.slice(0, 50).map((o) => ({
    id: o.id,
    name: o.name || '',
    website: o.website_url,
    linkedin_url: o.linkedin_url,
    industry: o.industry,
    location: [o.city, o.state, o.country].filter(Boolean).join(', '),
    employees: o.num_employees,
    revenue: o.annual_revenue,
    domain: o.primary_domain,
  }))

  // Sort alphabetically
  mapped.sort((a, b) => a.name.localeCompare(b.name))
  return mapped
}

/* ------------------------------ Route ------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody
    const names = arr(body.names)
    const locations = arr(body.locations)
    const keywords = arr(body.keywords)
    const permanent = Boolean(body.permanent ?? true)
    const limit = capInt(body.limit, 1, 50, 50)

    const apolloRes = await apolloCompaniesSearchPaged({
      names,
      locations,
      keywords,
      permanent,
      limit,
    })

    if (apolloRes instanceof NextResponse) return apolloRes

    return NextResponse.json(
      {
        results: apolloRes.slice(0, limit),
        employmentType: permanent ? 'permanent' : 'contract',
        total: apolloRes.length,
      },
      { status: 200 },
    )
  } catch (e: any) {
    console.error('companies route error', e)
    return NextResponse.json({ error: e?.message || 'Unknown server error' }, { status: 500 })
  }
}

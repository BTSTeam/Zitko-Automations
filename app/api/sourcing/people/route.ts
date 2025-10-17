// app/api/sourcing/people/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type PostBody = {
  titles?: string[]
  locations?: string[]
  keywords?: string[]
  permanent?: boolean
  limit?: number
}

/** Normalize and cap arrays */
function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
}

/** Helper to safely parse integers with default/floor */
function capInt(n: unknown, min = 1, max = 50, def = 50) {
  const x = Math.floor(Number(n))
  if (Number.isFinite(x)) return Math.max(min, Math.min(max, x))
  return def
}

/** Basic shape of an Apollo person contact we care about */
type ApolloPerson = {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  email?: string
  email_status?: string
  linkedin_url?: string
  people_auto_score?: number
  organization_name?: string
  organization?: { name?: string; linkedin_url?: string }
  organization_linkedin_url?: string
  present_raw_address?: string
}

/** Shape we return to the client */
type PersonOut = {
  id?: string
  name: string
  title?: string
  email?: string
  email_status?: string
  linkedin_url?: string
  organization_name?: string
  organization_linkedin_url?: string
  people_auto_score?: number
  location?: string
}

/* ------------------------------ Apollo ------------------------------ */

async function apolloPeopleSearch(input: {
  titles: string[]
  locations: string[]
  keywords: string[]
  limit: number
}) {
  const { titles, locations, keywords, limit } = input

  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing APOLLO_API_KEY' },
      { status: 500 },
    )
  }

  // Apollo Mixed People Search
  // We include: person_titles, person_locations, and a broad q_keywords string.
  // We will still post-filter by email_status === 'verified' to be safe/consistent.
  const url = 'https://api.apollo.io/api/v1/mixed_people/search'
  const body = {
    page: 1,
    per_page: limit,
    person_titles: titles.length ? titles : undefined,
    person_locations: locations.length ? locations : undefined,
    // q_keywords is a loose "any" match across people fields
    q_keywords: keywords.length ? keywords.join(' ') : undefined,
    // keep result richness; client sorts later
    display_edu_and_exp: true,
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Newer Apollo keys generally work as Bearer; if your key only supports api_key in body,
      // you can add { api_key: apiKey } into `body` above and remove this header.
      Authorization: `Bearer ${apiKey}`,
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    return NextResponse.json(
      { error: `Apollo people search error ${resp.status}: ${t}` },
      { status: 502 },
    )
  }

  const json = (await resp.json()) as any
  // Apollo commonly returns `contacts` in Mixed People Search
  const contacts: ApolloPerson[] = Array.isArray(json?.contacts)
    ? json.contacts
    : []

  // Filter verified emails only (per requirement)
  const verified = contacts.filter((c) => c?.email_status === 'verified')

  // Map to our outgoing shape
  const mapped: PersonOut[] = verified.map((c) => ({
    id: c.id,
    name: c.name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim(),
    title: c.title,
    email: c.email,
    email_status: c.email_status,
    linkedin_url: c.linkedin_url,
    organization_name: c.organization_name || c.organization?.name,
    organization_linkedin_url:
      c.organization_linkedin_url || c.organization?.linkedin_url,
    people_auto_score:
      typeof c.people_auto_score === 'number' ? c.people_auto_score : undefined,
    location: c.present_raw_address,
  }))

  // Sort by people_auto_score desc (if present)
  mapped.sort((a, b) => (b.people_auto_score ?? 0) - (a.people_auto_score ?? 0))

  return mapped
}

/* ----------------------------- Vincere ------------------------------ */

async function ensureVincereToken(): Promise<string | null> {
  // We require core Vincere env keys for calling the Tenant API
  try {
    requiredEnv() // checks VINCERE_ID_BASE, VINCERE_TENANT_API_BASE, VINCERE_CLIENT_ID, VINCERE_API_KEY, REDIRECT_URI
  } catch (e) {
    // If Env is missing, we cannot dedupe; return null to proceed without
    return null
  }

  const session = await getSession()
  let idTok = session?.tokens?.idToken
  if (idTok) return idTok

  // Attempt to refresh via stored refresh_token (server-side tokenStore)
  const ok = await refreshIdToken('default') // use your own userKey scheme if you prefer
  if (!ok) return null

  const session2 = await getSession()
  return session2?.tokens?.idToken ?? null
}

/**
 * Check if a candidate exists in Vincere by BOTH (name AND linkedin_url).
 * Returns true if at least one match is found; false otherwise.
 */
async function vincereCandidateExistsByNameAndLinkedIn(args: {
  name?: string
  linkedin_url?: string
  idToken: string
}): Promise<boolean> {
  const { name, linkedin_url, idToken } = args
  if (!name || !linkedin_url) return false

  // Build a search against candidate index using a text `q` that ANDs both fields.
  // Vincere API expects `q` (full text) and/or `fq` filters. We’ll use a strict phrase match.
  // Example: q=name:"John Smith" AND linkedin_url:"https://www.linkedin.com/in/johnsmith"
  const q = `name:"${name.replace(/"/g, '\\"')}" AND linkedin_url:"${linkedin_url.replace(/"/g, '\\"')}"`

  const u = new URL(
    config.VINCERE_TENANT_API_BASE.replace(/\/$/, '') +
      '/api/v2/candidate/search/fl=id,first_name,last_name,linkedin_url',
  )
  u.searchParams.set('q', `${q}#`) // the backend expects a trailing # per app helpers

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
    // Treat errors as "not found" but log server-side for diagnostics
    console.error('Vincere candidate search error', resp.status, await resp.text().catch(() => ''))
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

    const titles = arr(body.titles)
    const locations = arr(body.locations)
    const keywords = arr(body.keywords)
    const limit = capInt(body.limit, 1, 50, 50)
    // `permanent` is not used directly in Apollo query (contract adds auto keywords in the form layer).
    // We keep it for parity / potential future branching.
    const permanent = Boolean(body.permanent)

    // 1) Call Apollo for people
    const apolloRes = await apolloPeopleSearch({
      titles,
      locations,
      keywords,
      limit,
    })
    // If apolloRes is a NextResponse, bubble it back (error scenario)
    if (apolloRes instanceof NextResponse) return apolloRes

    const people: PersonOut[] = apolloRes

    // 2) Dedupe against Vincere by (name AND linkedin_url)
    const idToken = await ensureVincereToken()
    if (!idToken) {
      // If Vincere tokens/env are missing, return Apollo results without dedupe (or, enforce?)
      // Requirement says dedupe with Vincere, so if we cannot dedupe, we’ll still return results
      // but flag it so client could indicate “not deduped”.
      return NextResponse.json(
        { results: people, deduped: false, reason: 'Missing Vincere tokens or env' },
        { status: 200 },
      )
    }

    // Check existence concurrently but with a simple concurrency limit to avoid hammering the API
    const CONCURRENCY = 5
    let idx = 0
    const deduped: PersonOut[] = []

    async function worker() {
      while (idx < people.length) {
        const i = idx++
        const p = people[i]
        const exists = await vincereCandidateExistsByNameAndLinkedIn({
          name: p.name,
          linkedin_url: p.linkedin_url,
          idToken,
        })
        if (!exists) deduped.push(p)
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    // Already sorted by people_auto_score in apolloPeopleSearch()
    return NextResponse.json({ results: deduped, deduped: true }, { status: 200 })
  } catch (e: any) {
    console.error('people route error', e)
    return NextResponse.json(
      { error: e?.message || 'Unknown server error' },
      { status: 500 },
    )
  }
}

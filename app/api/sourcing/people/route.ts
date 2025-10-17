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
  limit?: number // client can still send, we'll cap to 50
}

/** Normalize and cap arrays */
function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
}

/** Safe int with bounds */
function capInt(n: unknown, min = 1, max = 50, def = 50) {
  const x = Math.floor(Number(n))
  if (Number.isFinite(x)) return Math.max(min, Math.min(max, x))
  return def
}

/** Apollo payload bits we care about */
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

/** Outgoing shape */
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

async function apolloPeopleSearchPaged(input: {
  titles: string[]
  locations: string[]
  keywords: string[]
  limit: number // cap 50
}) {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing APOLLO_API_KEY' }, { status: 500 })
  }

  const { titles, locations, keywords } = input

  // We’ll fetch exactly 2 pages of 25 each to total 50 (or less if API returns fewer).
  const per_page = 25
  const pages = [1, 2]

  const url = 'https://api.apollo.io/api/v1/mixed_people/search'
  const commonBody = {
    person_titles: titles.length ? titles : undefined,
    person_locations: locations.length ? locations : undefined,
    q_keywords: keywords.length ? keywords.join(' ') : undefined,
    contact_email_status: ['verified'] as string[], // ✅ filter at source
    include_similar_titles: true,
    display_edu_and_exp: true,
  }

  const all: ApolloPerson[] = []
  for (const page of pages) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ ...commonBody, page, per_page }),
    })

    if (!resp.ok) {
      const t = await resp.text().catch(() => '')
      return NextResponse.json(
        { error: `Apollo people search error ${resp.status}: ${t}` },
        { status: 502 },
      )
    }

    const json = (await resp.json()) as any
    const contacts: ApolloPerson[] = Array.isArray(json?.contacts) ? json.contacts : []
    all.push(...contacts)
  }

  // De-dupe (by id or linkedin_url) in case overlap across pages
  const seen = new Set<string>()
  const deduped = all.filter((c) => {
    const key = (c.id || c.linkedin_url || c.email || Math.random().toString(36)).toString()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Map to outgoing shape (all are verified already due to request filter)
  const mapped: PersonOut[] = deduped.slice(0, 50).map((c) => ({
    id: c.id,
    name: c.name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim(),
    title: c.title,
    email: c.email,
    email_status: c.email_status,
    linkedin_url: c.linkedin_url,
    organization_name: c.organization_name || c.organization?.name,
    organization_linkedin_url: c.organization_linkedin_url || c.organization?.linkedin_url,
    people_auto_score: typeof c.people_auto_score === 'number' ? c.people_auto_score : undefined,
    location: c.present_raw_address,
  }))

  // Sort by people_auto_score desc (if present)
  mapped.sort((a, b) => (b.people_auto_score ?? 0) - (a.people_auto_score ?? 0))

  return mapped
}

/* ----------------------------- Vincere ------------------------------ */

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

/** Check existence by BOTH (name AND linkedin_url) */
async function vincereCandidateExistsByNameAndLinkedIn(args: {
  name?: string
  linkedin_url?: string
  idToken: string
}): Promise<boolean> {
  const { name, linkedin_url, idToken } = args
  if (!name || !linkedin_url) return false

  const q = `name:"${name.replace(/"/g, '\\"')}" AND linkedin_url:"${linkedin_url.replace(/"/g, '\\"')}"`
  const u = new URL(
    config.VINCERE_TENANT_API_BASE.replace(/\/$/, '') +
      '/api/v2/candidate/search/fl=id,first_name,last_name,linkedin_url',
  )
  u.searchParams.set('q', `${q}#`)

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
    const limit = capInt(body.limit, 1, 50, 50) // still honored, but we fetch up to 50

    // 1) Apollo (2 pages × 25, verified only)
    const apolloRes = await apolloPeopleSearchPaged({
      titles,
      locations,
      keywords,
      limit,
    })
    if (apolloRes instanceof NextResponse) return apolloRes
    const people: PersonOut[] = apolloRes

    // 2) Dedupe against Vincere (name AND LinkedIn)
    const idToken = await ensureVincereToken()
    if (!idToken) {
      return NextResponse.json(
        { results: people.slice(0, limit), deduped: false, reason: 'Missing Vincere tokens or env' },
        { status: 200 },
      )
    }

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

    return NextResponse.json(
      { results: deduped.slice(0, limit), deduped: true },
      { status: 200 },
    )
  } catch (e: any) {
    console.error('people route error', e)
    return NextResponse.json({ error: e?.message || 'Unknown server error' }, { status: 500 })
  }
}

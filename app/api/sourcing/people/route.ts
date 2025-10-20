// app/api/sourcing/people/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'
import { ensureApolloToken } from '@/lib/apolloRefresh'

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
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
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

/* ------------------------------ Helpers ------------------------------ */

function normName(s?: string) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Build the Apollo keyword string based on:
 * - user-provided keywords
 * - employment type rules:
 *    Contract  => MUST include: IR35, "Pay Rate"
 *    Permanent => SHOULD exclude: IR35, "Pay Rate"
 *
 * Note: Apollo's mixed_people search supports a free-text
 * q_keywords. We encode inclusion/exclusion using tokens;
 * if Apollo ignores exclusions, results will still be valid, just broader.
 */
function buildApolloKeywordQuery(keywords: string[], permanent: boolean): string | undefined {
  const base = [...keywords].filter(Boolean)

  const IR35 = 'IR35'
  const PAY_RATE = '"Pay Rate"'

  if (permanent === false) {
    // CONTRACT: ensure they are included at query-level
    if (!base.some(k => /(^|[^a-z])ir35([^a-z]|$)/i.test(k))) base.push(IR35)
    if (!base.some(k => /pay\s*rate/i.test(k))) base.push(PAY_RATE)
  } else {
    // PERMANENT: try to exclude via minus tokens
    // (leave user keywords intact)
    base.push(`- ${IR35}`)
    base.push(`- ${PAY_RATE}`)
  }

  const q = base.join(' ').trim()
  return q.length ? q : undefined
}

/* ------------------------------ Apollo ------------------------------ */

async function apolloPeopleSearchPaged(input: {
  titles: string[]
  locations: string[]
  keywords: string[]
  permanent: boolean
  limit: number // cap 50
}) {
  // ✅ Use OAuth bearer token (NOT API key)
  const accessToken = await ensureApolloToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'Not connected to Apollo (OAuth)' }, { status: 401 })
  }

  const { titles, locations, keywords, permanent } = input

  // Pull up to 50 (2 * 25). If the caller asked for < 50, we'll slice later.
  const per_page = 25
  const pages = [1, 2]

  const url = 'https://api.apollo.io/api/v1/mixed_people/search'
  const q_keywords = buildApolloKeywordQuery(keywords, permanent)

  const commonBody: Record<string, any> = {
    person_titles: titles.length ? titles : undefined,
    person_locations: locations.length ? locations : undefined,
    q_keywords,
    contact_email_status: ['verified'], // ✅ verified only
    include_similar_titles: true,
    display_edu_and_exp: true,
  }

  const all: ApolloPerson[] = []

  for (const page of pages) {
    const body = { ...commonBody, page, per_page }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`, // ✅ OAuth bearer header
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
    const contacts: ApolloPerson[] = Array.isArray(json?.contacts) ? json.contacts : []
    all.push(...contacts)
  }

  // De-dupe across pages STRICTLY by name + linkedin_url
  const seen = new Set<string>()
  const deduped = all.filter((c) => {
    const name = normName(c.name || [c.first_name, c.last_name].filter(Boolean).join(' '))
    const li = String(c.linkedin_url ?? '').trim().toLowerCase()
    const key = `${name}__${li}`
    if (!name || !li) return true // keep if missing either; Vincere step will handle final gate
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Map to outgoing shape
  const mapped: PersonOut[] = deduped.map((c) => ({
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

  const safeName = name.replace(/"/g, '\\"')
  const safeLi = linkedin_url.replace(/"/g, '\\"')

  // NOTE: Using keywords (q) to combine conditions. Tail end "#"
  // preserves phrase searches reliably in Vincere.
  const q = `name:"${safeName}" AND linkedin_url:"${safeLi}"`

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
    const permanent = Boolean(body.permanent ?? true) // default to Permanent
    const limit = capInt(body.limit, 1, 50, 50)

    // 1) Apollo (2 pages × 25, verified only) + employment-type keyword rules
    const apolloRes = await apolloPeopleSearchPaged({
      titles,
      locations,
      keywords,
      permanent,
      limit,
    })
    if (apolloRes instanceof NextResponse) return apolloRes
    const people: PersonOut[] = apolloRes

    // Quick hard cap BEFORE Vincere checks to avoid excessive calls
    const precheck = people.slice(0, 200) // safety cap before Vincere I/O

    // 2) Dedupe against Vincere (name AND LinkedIn)
    const idToken = await ensureVincereToken()
    if (!idToken) {
      // Return Apollo results sliced, but indicate we didn't run Vincere de-dupe
      return NextResponse.json(
        {
          results: precheck.slice(0, limit),
          deduped: false,
          reason: 'Missing Vincere tokens or env',
          employmentType: permanent ? 'permanent' : 'contract',
        },
        { status: 200 },
      )
    }

    const CONCURRENCY = 5
    let idx = 0
    const deduped: PersonOut[] = []

    async function worker() {
      while (idx < precheck.length) {
        const i = idx++
        const p = precheck[i]
        const exists = await vincereCandidateExistsByNameAndLinkedIn({
          name: p.name,
          linkedin_url: p.linkedin_url,
          idToken,
        })
        if (!exists) deduped.push(p)
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    // Final slice to requested limit
    return NextResponse.json(
      {
        results: deduped.slice(0, limit),
        deduped: true,
        employmentType: permanent ? 'permanent' : 'contract',
      },
      { status: 200 },
    )
  } catch (e: any) {
    console.error('people route error', e)
    return NextResponse.json({ error: e?.message || 'Unknown server error' }, { status: 500 })
  }
}

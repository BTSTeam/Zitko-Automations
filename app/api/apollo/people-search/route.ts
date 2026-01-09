// app/api/apollo/people-search/route.ts
// ✅ Keeps UI output the same shape as before by:
// 1) Using Apollo /mixed_people/api_search (shallow results)
// 2) Immediately bulk-enriching returned IDs via /people/bulk_match
// 3) Merging enriched fields back into the exact UI fields you already return

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search'
const APOLLO_BULK_ENRICH_URL = 'https://api.apollo.io/api/v1/people/bulk_match'

type InBody = {
  person_titles?: string[] | string
  q_keywords?: string[] | string // chips ok
  person_locations?: string[] | string
  person_seniorities?: string[] | string
  page?: number | string
  per_page?: number | string // ignored (we keep fixed)
}

function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map((s) => s.trim()).filter(Boolean)
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
function toPosInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
function safeStr(v: any): string {
  return typeof v === 'string' ? v.trim() : ''
}

// Apollo returns different shapes depending on endpoint/plan.
// For enrichment, the docs call it "id" (person_id). Mixed search often returns person_id too.
// Be defensive and accept both.
function getApolloPersonId(p: any): string {
  return (
    safeStr(p?.person_id) ||
    safeStr(p?.personId) ||
    safeStr(p?.id) ||
    safeStr(p?._id) ||
    ''
  )
}

const ALLOWED_SENIORITIES = new Set([
  'owner',
  'founder',
  'c_suite',
  'partner',
  'vp',
  'head',
  'director',
  'manager',
  'senior',
  'entry',
  'intern',
])

export async function POST(req: NextRequest) {
  const DEBUG = (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true'

  let inBody: InBody = {}
  try {
    inBody = (await req.json()) as InBody
  } catch {}

  const person_titles = toArray(inBody.person_titles)
  const person_locations = toArray(inBody.person_locations)
  const person_seniorities = toArray(inBody.person_seniorities).filter((s) =>
    ALLOWED_SENIORITIES.has(s as any),
  )

  // q_keywords can arrive as array (chips) or string. Join chips with spaces.
  const keywordParts = Array.isArray(inBody.q_keywords)
    ? inBody.q_keywords
        .filter(Boolean)
        .map((x) => String(x).trim())
        .filter(Boolean)
    : typeof inBody.q_keywords === 'string'
      ? [inBody.q_keywords.trim()]
      : []
  const q_keywords = keywordParts.join(' ').trim()

  const page = toPosInt(inBody.page, 1)
  const per_page = 25 // fixed by design

  // -------------------------
  // Build api_search query
  // -------------------------
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('per_page', String(per_page))

  person_titles.forEach((t) => params.append('person_titles[]', t))
  person_locations.forEach((l) => params.append('person_locations[]', l))
  person_seniorities.forEach((s) => params.append('person_seniorities[]', s))

  // Some Apollo setups accept q_keywords. If ignored, harmless.
  if (q_keywords) params.set('q_keywords', q_keywords)

  // -------------------------
  // Auth (API key preferred)
  // -------------------------
  const session = await getSession()
  const userKey = session.user?.email || session.sessionId || ''
  let accessToken = session.tokens?.apolloAccessToken
  const apiKey = process.env.APOLLO_API_KEY

  if (!apiKey && !accessToken) {
    return NextResponse.json(
      { error: 'Not authenticated: no Apollo OAuth token or APOLLO_API_KEY present' },
      { status: 401 },
    )
  }

  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    }
    // api_search + enrichment are intended for X-Api-Key; prefer it when available
    if (apiKey) h['X-Api-Key'] = apiKey
    else if (accessToken) h.Authorization = `Bearer ${accessToken}`
    return h
  }

  const searchUrl = `${APOLLO_SEARCH_URL}?${params.toString()}`
  const callSearch = (headers: Record<string, string>) =>
    fetch(searchUrl, { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-store' })

  if (DEBUG) {
    const dbgHeaders = { ...buildHeaders() }
    if (dbgHeaders.Authorization) dbgHeaders.Authorization = 'Bearer ***'
    if (dbgHeaders['X-Api-Key']) dbgHeaders['X-Api-Key'] = '***'
    console.info('[Apollo DEBUG] Search →', { url: searchUrl, headers: dbgHeaders })
  }

  try {
    // -------------------------
    // 1) api_search
    // -------------------------
    let searchResp = await callSearch(buildHeaders())

    // refresh only applies to OAuth scenarios (no apiKey)
    if ((searchResp.status === 401 || searchResp.status === 403) && !apiKey && accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        accessToken = s2.tokens?.apolloAccessToken
        searchResp = await callSearch(buildHeaders())
      }
    }

    const searchRaw = await searchResp.text()
    if (!searchResp.ok) {
      return NextResponse.json(
        {
          error: `Apollo search error: ${searchResp.status} ${searchResp.statusText}`,
          details: searchRaw?.slice(0, 2000),
        },
        { status: searchResp.status || 400 },
      )
    }

    let searchData: any = {}
    try {
      searchData = searchRaw ? JSON.parse(searchRaw) : {}
    } catch {
      searchData = {}
    }
    if (typeof searchData === 'string') {
      try {
        searchData = JSON.parse(searchData)
      } catch {
        searchData = {}
      }
    }

    const shallowArr: any[] = Array.isArray(searchData?.people) ? searchData.people : []

    // IMPORTANT: Enrichment expects Apollo person_id (docs call this "id").
    // Mixed search may return either `person_id` or `id`. We accept both defensively.
    const ids: string[] = shallowArr.map(getApolloPersonId).filter(Boolean)

    // If nothing returned, keep same response shape
    if (!ids.length) {
      return NextResponse.json({
        meta: { page, per_page, count: 0 },
        breadcrumbs: searchData?.breadcrumbs ?? [],
        pagination: searchData?.pagination ?? { page, per_page },
        people: [],
        apollo: { search: searchData, enrich: null },
        apollo_pretty: JSON.stringify({ search: searchData, enrich: null }, null, 2),
      })
    }

    // -------------------------
    // 2) bulk_match enrichment
    //    - Apollo limit: 10 per request
    //    - Flags MUST be top-level (not per-detail)
    // -------------------------
    const reveal_personal_emails = false
    const reveal_phone_number = false

    // Only required if reveal_phone_number=true
    const webhook_url = process.env.APOLLO_PHONE_WEBHOOK_URL || ''

    if (reveal_phone_number && !webhook_url) {
      return NextResponse.json(
        {
          error:
            'Apollo config error: reveal_phone_number=true requires APOLLO_PHONE_WEBHOOK_URL (webhook_url) to be set.',
        },
        { status: 500 },
      )
    }

    const batches = chunk(ids, 10)

    const enrichHeaders = buildHeaders()
    const callEnrichBatch = (details: Array<{ id: string }>) =>
      fetch(APOLLO_BULK_ENRICH_URL, {
        method: 'POST',
        headers: enrichHeaders,
        body: JSON.stringify({
          details,
          reveal_personal_emails,
          reveal_phone_number,
          ...(reveal_phone_number ? { webhook_url } : {}),
        }),
        cache: 'no-store',
      })

    if (DEBUG) {
      const dbgHeaders = { ...enrichHeaders }
      if (dbgHeaders.Authorization) dbgHeaders.Authorization = 'Bearer ***'
      if (dbgHeaders['X-Api-Key']) dbgHeaders['X-Api-Key'] = '***'
      console.info('[Apollo DEBUG] Enrich →', {
        url: APOLLO_BULK_ENRICH_URL,
        headers: dbgHeaders,
        batches: batches.length,
        reveal_personal_emails,
        reveal_phone_number,
        webhook_url: reveal_phone_number ? '***' : undefined,
      })
    }

    const enrichedPeople: any[] = []
    const enrichErrors: Array<{ batch: number; status?: number; message: string }> = []
    const enrichRawSamples: Array<{ batch: number; ok: boolean; status: number; body: any }> = []

    for (let b = 0; b < batches.length; b++) {
      const batchIds = batches[b]

      // Correct payload: each detail is an object; only identification fields belong here.
      const details = batchIds.map((id) => ({ id }))

      const resp = await callEnrichBatch(details)
      const text = await resp.text()

      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = { _raw: text }
      }

      if (DEBUG) {
        enrichRawSamples.push({ batch: b, ok: resp.ok, status: resp.status, body: data })
      }

      if (!resp.ok) {
        enrichErrors.push({
          batch: b,
          status: resp.status,
          message: data?.error || data?.message || (typeof text === 'string' ? text.slice(0, 500) : 'Apollo error'),
        })
        continue
      }

      // Bulk match commonly returns "matches" array; be defensive anyway.
      const matchesArr: any[] =
        (Array.isArray(data?.matches) && data.matches) ||
        (Array.isArray(data?.people) && data.people) ||
        (Array.isArray(data?.persons) && data.persons) ||
        (Array.isArray(data?.matched_people) && data.matched_people) ||
        []

      for (const item of matchesArr) {
        // Many shapes: { person: {...} } or { people: {...} } or direct person
        const p = item?.person ?? item?.people ?? item
        if (p && (p.id || p._id || p.person_id)) enrichedPeople.push(p)
      }

      // Sometimes a single object might come back
      const single = data?.person ?? data?.people
      if (single && (single.id || single._id || single.person_id)) {
        enrichedPeople.push(single)
      }
    }

    // Index enriched people by Apollo person id for stable merge
    const enrichedById: Record<string, any> = {}
    for (const p of enrichedPeople) {
      const id = getApolloPersonId(p)
      if (!id) continue
      enrichedById[id] = p
    }

    // -------------------------
    // 3) Build FINAL UI people[]
    //    - Keep EXACT keys you were returning before
    // -------------------------
    const people = ids
      .map((id) => {
        const ep = enrichedById[id]

        // Find the matching shallow row defensively too
        const sp =
          shallowArr.find((x: any) => getApolloPersonId(x) === id) || {}

        // Prefer enriched
        const first = safeStr(ep?.first_name) || safeStr(sp?.first_name)
        const last = safeStr(ep?.last_name) // full
        const lastOb = safeStr(sp?.last_name_obfuscated)

        const name =
          (ep?.name && safeStr(ep.name)) ||
          [first, last].filter(Boolean).join(' ').trim() ||
          [first, lastOb].filter(Boolean).join(' ').trim() ||
          null

        const title =
          (ep?.title && safeStr(ep.title)) ||
          (Array.isArray(ep?.employment_history) && safeStr(ep.employment_history?.[0]?.title)) ||
          (sp?.title && safeStr(sp.title)) ||
          null

        const organization_name =
          (Array.isArray(ep?.employment_history) && safeStr(ep.employment_history?.[0]?.organization_name)) ||
          safeStr(ep?.organization?.name) ||
          safeStr(sp?.organization?.name) ||
          null

        const formatted_address =
          (typeof ep?.formatted_address === 'string' && ep.formatted_address.trim()) ||
          (typeof ep?.present_raw_address === 'string' && ep.present_raw_address.trim()) ||
          (typeof ep?.location?.name === 'string' && ep.location.name.trim()) ||
          (([ep?.city, ep?.state, ep?.country].filter(Boolean).join(', ') || null) as any)

        const headline = typeof ep?.headline === 'string' && ep.headline.trim() ? ep.headline.trim() : null

        const linkedin_url =
          typeof ep?.linkedin_url === 'string' && ep.linkedin_url ? ep.linkedin_url : null

        const facebook_url =
          typeof ep?.facebook_url === 'string' && ep.facebook_url ? ep.facebook_url : null

        const autoScore =
          typeof ep?.people_auto_score === 'number'
            ? ep.people_auto_score
            : typeof ep?.auto_score === 'number'
              ? ep.auto_score
              : null

        return {
          id,
          name,
          title: title ? String(title).trim() : null,
          organization_name: organization_name ? String(organization_name).trim() : null,
          formatted_address: formatted_address ? String(formatted_address).trim() : null,
          headline,
          linkedin_url,
          facebook_url,
          autoScore,
        }
      })
      .filter((p) => p && p.id)

    // Keep your original sort logic
    people.sort(
      (a, b) =>
        (b.autoScore ?? 0) - (a.autoScore ?? 0) ||
        String(a.name ?? '').localeCompare(String(b.name ?? '')),
    )

    const combinedApollo = {
      search: searchData,
      enrich: {
        errors: enrichErrors,
        enrichedCount: Object.keys(enrichedById).length,
        ...(DEBUG ? { samples: enrichRawSamples } : {}),
      },
    }

    return NextResponse.json({
      meta: { page, per_page, count: people.length },
      breadcrumbs: searchData?.breadcrumbs ?? [],
      pagination: searchData?.pagination ?? { page, per_page },
      people,
      apollo: combinedApollo,
      // Keep pretty output useful for debugging
      apollo_pretty: JSON.stringify(combinedApollo, null, 2),
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error during Apollo request', details: String(err) },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST /api/apollo/people-search with a JSON body.' }, { status: 405 })
}

// app/api/apollo/hiring-search/route.ts
// ✅ Updated to keep UI behaviour the same as before by:
// 1) Using /mixed_people/api_search (shallow results)
// 2) Immediately bulk-enriching returned person IDs via /people/bulk_match
// 3) Returning hiringByOrg grouped with ENRICHED (full) person objects (like old endpoint did)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

const APOLLO_API_KEY = process.env.APOLLO_API_KEY
const APOLLO_PHONE_WEBHOOK_URL = process.env.APOLLO_PHONE_WEBHOOK_URL || ''
if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set')

const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search'
const APOLLO_BULK_ENRICH_URL = 'https://api.apollo.io/api/v1/people/bulk_match'

const DEFAULT_HIRING_TITLES = [
  'Talent Acquisition',
  'Talent Acquisition Manager',
  'Talent Acquisition Partner',
  'TA Manager',
  'Recruitment Manager',
  'Head of Recruitment',
  'Head of Talent',
  'Internal Recruiter',
  'Recruiter',
  'Hiring Manager',
  'HR Manager',
  'People Manager',
]

type PostBody = {
  org_ids?: string[]
  per_page?: number
  person_titles?: string[]
}

function safeStr(v: any): string {
  return typeof v === 'string' ? v.trim() : ''
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Mixed search + enrich can return id or person_id depending on endpoint/plan.
// Enrichment docs want person_id (called "id" in that endpoint).
function getApolloPersonId(p: any): string {
  return (
    safeStr(p?.person_id) ||
    safeStr(p?.personId) ||
    safeStr(p?.id) ||
    safeStr(p?._id) ||
    ''
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody

    const orgIds = Array.isArray(body.org_ids)
      ? body.org_ids.map((x) => safeStr(x)).filter(Boolean)
      : []

    if (!orgIds.length) {
      return NextResponse.json({ error: 'org_ids[] is required' }, { status: 400 })
    }

    const perPageRaw = Number(body.per_page ?? 3)
    const per_page = Number.isFinite(perPageRaw) ? Math.min(Math.max(perPageRaw, 1), 10) : 3

    const person_titles =
      Array.isArray(body.person_titles) && body.person_titles.length
        ? body.person_titles
        : DEFAULT_HIRING_TITLES

    // -------------------------
    // 1) api_search (shallow)
    // -------------------------
    const params = new URLSearchParams()
    params.set('page', '1')
    params.set('per_page', String(per_page))

    person_titles.forEach((t) => params.append('person_titles[]', t))
    orgIds.forEach((id) => params.append('organization_ids[]', id))

    // Keep old behaviour where possible (harmless if ignored)
    params.set('include_similar_titles', 'true')

    const searchUrl = `${APOLLO_SEARCH_URL}?${params.toString()}`

    const searchResp = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY,
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    })

    const searchText = await searchResp.text()
    let searchData: any = {}
    try {
      searchData = searchText ? JSON.parse(searchText) : {}
    } catch {
      searchData = {}
    }

    if (!searchResp.ok) {
      return NextResponse.json(
        {
          error: searchData?.error || searchText || 'Apollo api_search failed',
          apolloStatus: searchResp.status,
          searchUrl,
        },
        { status: searchResp.status },
      )
    }

    const shallowList: any[] = Array.isArray(searchData?.people) ? searchData.people : []
    const ids: string[] = shallowList.map(getApolloPersonId).filter(Boolean)

    if (!ids.length) {
      return NextResponse.json({
        hiringByOrg: {},
        apollo: { search: searchData, enrich: null },
      })
    }

    // -------------------------
    // 2) bulk_match enrichment
    // -------------------------
    const reveal_personal_emails = false
    const reveal_phone_number = false

    if (reveal_phone_number && !APOLLO_PHONE_WEBHOOK_URL) {
      return NextResponse.json(
        {
          error:
            'Apollo config error: reveal_phone_number=true requires APOLLO_PHONE_WEBHOOK_URL (webhook_url) to be set.',
        },
        { status: 500 },
      )
    }

    const batches = chunk(ids, 10)
    const enrichedPeople: any[] = []
    const enrichErrors: Array<{ batch: number; status?: number; message: string }> = []

    for (let b = 0; b < batches.length; b++) {
      const batchIds = batches[b]

      // ✅ Correct payload:
      // - details[] = identifying fields only
      // - flags at top level
      const payload: any = {
        details: batchIds.map((id) => ({ id })),
        reveal_personal_emails,
        reveal_phone_number,
        ...(reveal_phone_number ? { webhook_url: APOLLO_PHONE_WEBHOOK_URL } : {}),
      }

      const enrichResp = await fetch(APOLLO_BULK_ENRICH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': APOLLO_API_KEY,
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })

      const enrichText = await enrichResp.text()
      let enrichData: any = {}
      try {
        enrichData = enrichText ? JSON.parse(enrichText) : {}
      } catch {
        enrichData = { _raw: enrichText }
      }

      if (!enrichResp.ok) {
        enrichErrors.push({
          batch: b,
          status: enrichResp.status,
          message:
            enrichData?.error ||
            enrichData?.message ||
            (typeof enrichText === 'string' ? enrichText.slice(0, 500) : 'Apollo enrich error'),
        })
        continue
      }

      // Bulk match commonly returns `matches`; keep defensive fallbacks.
      const matchesArr: any[] =
        (Array.isArray(enrichData?.matches) && enrichData.matches) ||
        (Array.isArray(enrichData?.people) && enrichData.people) ||
        (Array.isArray(enrichData?.persons) && enrichData.persons) ||
        (Array.isArray(enrichData?.matched_people) && enrichData.matched_people) ||
        []

      for (const item of matchesArr) {
        const p = item?.person ?? item?.people ?? item
        if (p && (p.id || p._id || p.person_id)) enrichedPeople.push(p)
      }

      const single = enrichData?.person ?? enrichData?.people
      if (single && (single.id || single._id || single.person_id)) {
        enrichedPeople.push(single)
      }
    }

    // Index enriched by person id so we can merge/stabilise output
    const enrichedById: Record<string, any> = {}
    for (const p of enrichedPeople) {
      const id = getApolloPersonId(p)
      if (!id) continue
      enrichedById[id] = p
    }

    // -------------------------
    // 3) Group by org with ENRICHED objects
    // -------------------------
    const hiringByOrg: Record<string, any[]> = {}

    for (const id of ids) {
      const ep = enrichedById[id]
      const sp = shallowList.find((x: any) => getApolloPersonId(x) === id) || {}

      const orgId = (
        ep?.organization_id ??
        ep?.org_id ??
        ep?.account_id ??
        ep?.organization?.id ??
        sp?.organization_id ??
        sp?.org_id ??
        sp?.account_id ??
        sp?.organization?.id ??
        ''
      )
        .toString()
        .trim()

      if (!orgId) continue
      if (!hiringByOrg[orgId]) hiringByOrg[orgId] = []

      // ✅ push enriched person object to keep UI same as before
      // If enrichment failed for this id, fall back to shallow object (still shows something)
      hiringByOrg[orgId].push(ep || sp)
    }

    return NextResponse.json({
      hiringByOrg,
      apollo: {
        search: searchData,
        enrich: {
          enrichedCount: Object.keys(enrichedById).length,
          errors: enrichErrors,
        },
      },
    })
  } catch (err: any) {
    console.error('hiring-search route error', err)
    return NextResponse.json(
      { error: err?.message || 'Unexpected server error in hiring-search' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST /api/apollo/hiring-search with a JSON body.' }, { status: 405 })
}

// app/api/apollo/people-enrich/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

const APOLLO_API_KEY = process.env.APOLLO_API_KEY

if (!APOLLO_API_KEY) {
  throw new Error('APOLLO_API_KEY is not set')
}

/**
 * Apollo Bulk People Enrichment:
 * - Endpoint: POST https://api.apollo.io/api/v1/people/bulk_match
 * - Limit: up to 10 people per request (Apollo docs/tutorials)
 *
 * NOTE:
 * - This consumes credits depending on your Apollo plan.
 * - For email/phone you must set reveal_personal_emails / reveal_phone_number.
 * - APOLLO_API_KEY must be the correct (master) API key for these endpoints.
 */

type InBody = {
  ids: string[] // Apollo person IDs from api_search results
  reveal_personal_emails?: boolean
  reveal_phone_number?: boolean
  // If true, we return the raw Apollo JSON too (useful for debugging)
  include_raw_response?: boolean
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function toCleanIds(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i) // de-dupe
}

export async function POST(req: NextRequest) {
  let body: InBody
  try {
    body = (await req.json()) as InBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const ids = toCleanIds(body.ids)
  if (!ids.length) {
    return NextResponse.json({ error: 'ids[] is required' }, { status: 400 })
  }

  // Hard cap to prevent accidental credit burn (tweak if you like)
  const HARD_CAP = 50
  const idsCapped = ids.slice(0, HARD_CAP)

  const reveal_personal_emails = Boolean(body.reveal_personal_emails)
  const reveal_phone_number = Boolean(body.reveal_phone_number)
  const include_raw_response = Boolean(body.include_raw_response)

  const endpoint = 'https://api.apollo.io/api/v1/people/bulk_match'

  const headers: Record<string, string> = {
    accept: 'application/json',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': APOLLO_API_KEY,
  }

  const batches = chunk(idsCapped, 10)

  const rawBatches: any[] = []
  const enrichedPeople: any[] = []
  const errors: Array<{ batch: number; status?: number; message: string }> = []

  for (let b = 0; b < batches.length; b++) {
    const batchIds = batches[b]

    // Apollo expects: { details: [{ id, reveal_personal_emails, reveal_phone_number }, ...] }
    const payload = {
      details: batchIds.map((id) => ({
        id,
        reveal_personal_emails,
        reveal_phone_number,
      })),
    }

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        cache: 'no-store',
      })

      const text = await resp.text()
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = { _raw: text }
      }

      if (!resp.ok) {
        errors.push({
          batch: b,
          status: resp.status,
          message:
            data?.error ||
            data?.message ||
            (typeof text === 'string' ? text.slice(0, 500) : 'Apollo error'),
        })
        if (include_raw_response) rawBatches.push({ batch: b, payload, resp: data })
        continue
      }

      // Be defensive: Apollo sometimes uses different keys. We gather what we can.
      const peopleArr: any[] =
        (Array.isArray(data?.people) && data.people) ||
        (Array.isArray(data?.persons) && data.persons) ||
        (Array.isArray(data?.matched_people) && data.matched_people) ||
        []

      // Some responses may nest in { people: [{ person: {...}}] } or { matches: [...] }
      for (const item of peopleArr) {
        const p = item?.person ?? item
        if (p && (p.id || p._id)) enrichedPeople.push(p)
      }

      // Also handle single-person style keys just in case
      const single = data?.person
      if (single && (single.id || single._id)) enrichedPeople.push(single)

      if (include_raw_response) rawBatches.push({ batch: b, payload, resp: data })
    } catch (e: any) {
      errors.push({ batch: b, message: e?.message || String(e) })
    }
  }

  // Map by id so UI can merge easily
  const enrichedById: Record<string, any> = {}
  for (const p of enrichedPeople) {
    const id = String(p?.id ?? p?._id ?? '').trim()
    if (!id) continue
    enrichedById[id] = p
  }

  const response: any = {
    meta: {
      requested: ids.length,
      capped: idsCapped.length,
      batches: batches.length,
      enriched: Object.keys(enrichedById).length,
      reveal_personal_emails,
      reveal_phone_number,
    },
    enrichedById,
    errors,
  }

  if (include_raw_response) response.apollo_raw_batches = rawBatches

  return NextResponse.json(response)
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/people-enrich with JSON body: { ids: [...] }' },
    { status: 405 },
  )
}

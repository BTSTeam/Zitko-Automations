// app/api/vincere/talentpool/[id]/count/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

type VincereSliceResp = {
  slice_index?: number
  num_of_elements?: number
  last?: boolean
  content?: any[]
}

function extractCandidateId(row: any): string {
  // Try common Vincere id shapes; fall back to email if needed
  const id =
    row?.id ??
    row?.candidate_id ??
    row?.candidateId ??
    row?.person_id ??
    row?.personId ??
    row?.contact_id ??
    row?.contactId ??
    null

  if (id != null && String(id).trim() !== '') return String(id).trim()

  const email =
    row?.email ??
    row?.primary_email ??
    row?.candidate_email ??
    row?.contact_email ??
    row?.emailAddress ??
    row?.contact?.email ??
    row?.person?.email ??
    (Array.isArray(row?.emails) && row.emails[0]?.email) ??
    ''

  if (email && String(email).trim() !== '') return `email:${String(email).trim().toLowerCase()}`
  return ''
}

// Generic fetch that retries once after refreshing the Vincere id token
async function fetchWithRefresh(
  userKey: string,
  url: string,
  init: RequestInit & { headers?: Record<string, string> },
) {
  let session = await getSession()
  let idToken = session.tokens?.idToken

  const doFetch = (token: string | undefined) =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'id-token': token || '',
        'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
        accept: 'application/json',
        Authorization: `Bearer ${token || ''}`,
        ...(init.headers || {}),
      },
      cache: 'no-store',
    })

  let res = await doFetch(idToken)
  if (res.status === 401 || res.status === 403) {
    const ok = await refreshIdToken(userKey)
    if (!ok) return res
    session = await getSession()
    idToken = session.tokens?.idToken
    res = await doFetch(idToken)
  }
  return res
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const poolId = params.id
    if (!poolId) {
      return NextResponse.json({ error: 'Missing pool id' }, { status: 400 })
    }

    const session = await getSession()
    const userKey = session.user?.email ?? 'unknown'
    const idToken = session.tokens?.idToken
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    // IMPORTANT: count must be done in the context of a user (same as Vincere UI list)
    // Allow passing userId from the UI; fall back to env; fall back to previous default.
    const userId =
      (req.nextUrl.searchParams.get('userId') || '').trim() ||
      process.env.VINCERE_TALENTPOOL_USER_ID?.trim() ||
      process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID?.trim() ||
      '29018'

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    // Iterate slices until "last" is true. Count unique candidate IDs.
    const seenIds = new Set<string>()
    let sliceIndex = 0
    let last = false
    let pagesFetched = 0
    let totalRowsSeen = 0

    // Hard safety cap
    const SLICE_CAP = 5000

    while (!last && sliceIndex < SLICE_CAP) {
      const url = `${BASE}/talentpool/${encodeURIComponent(poolId)}/user/${encodeURIComponent(
        userId,
      )}/candidates?index=${sliceIndex}`

      const res = await fetchWithRefresh(userKey, url, { method: 'GET' })
      if (!res.ok) {
        // If the first slice fails, treat as an error
        const body = await res.text().catch(() => '')
        if (sliceIndex === 0) {
          return NextResponse.json(
            { error: `Vincere slice fetch failed (${res.status})`, details: body },
            { status: res.status },
          )
        }
        // Otherwise stop and return what we have
        break
      }

      const slice = (await res.json().catch(() => ({}))) as VincereSliceResp
      const arr = Array.isArray(slice?.content) ? slice.content : []
      pagesFetched++
      totalRowsSeen += arr.length

      for (const row of arr) {
        const key = extractCandidateId(row)
        if (!key) continue
        seenIds.add(key)
      }

      last = !!slice?.last
      sliceIndex++
    }

    return NextResponse.json(
      {
        total: seenIds.size,       // <-- this is the "Vincere UI-style" count you want to show
        meta: {
          pagesFetched,
          totalRowsSeen,
          userIdUsed: userId,
        },
      },
      { status: 200 },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

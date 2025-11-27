export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type VincereSliceResp = {
  slice_index?: number
  num_of_elements?: number
  last?: boolean
  content?: any[]
  // some Vincere endpoints also return totalElements
  totalElements?: number
}

type ContactPreview = {
  first_name?: string
  last_name?: string
  email?: string
}

/**
 * Ensure base URL includes /api/v2
 */
function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

/**
 * Generic fetch that retries once after refreshing the Vincere idToken
 */
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
        'x-api-key':
          (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
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

export async function GET(
  req: Request,
  // userId is optional; we fall back to env config the same way as the talent pool routes
  { params }: { params: { id: string; userId?: string } },
) {
  try {
    const { id, userId } = params

    if (!id) {
      return NextResponse.json(
        { error: 'Missing distribution list id' },
        { status: 400 },
      )
    }

    const session = await getSession()
    const userKey = session.user?.email ?? 'unknown'

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    // Mirror the talent pool env pattern for the Vincere user
    const resolvedUserId =
      userId ||
      process.env.VINCERE_DISTRIBUTIONLIST_USER_ID ||
      process.env.NEXT_PUBLIC_VINCERE_DISTRIBUTIONLIST_USER_ID ||
      process.env.VINCERE_TALENTPOOL_USER_ID ||
      '29018'

    const { searchParams } = new URL(req.url)
    const limitRaw = searchParams.get('limit') ?? searchParams.get('rows') ?? '50'
    const limit = Math.max(1, Math.min(200, Number(limitRaw) || 50))

    const contacts: ContactPreview[] = []
    let sliceIndex = 0
    let last = false
    let slicesFetched = 0
    let total: number | null = null

    while (!last && contacts.length < limit && sliceIndex < 400) {
      const url = `${BASE}/distributionlist/${encodeURIComponent(
        id,
      )}/user/${encodeURIComponent(resolvedUserId)}/contacts?index=${sliceIndex}`

      const res = await fetchWithRefresh(userKey, url, { method: 'GET' })

      if (!res.ok) {
        // if the first slice fails, treat as fatal; otherwise break and return what we have
        if (sliceIndex === 0) {
          const body = await res.text().catch(() => '')
          return NextResponse.json(
            {
              error: `Vincere distribution list slice fetch failed (${res.status})`,
              details: body,
            },
            { status: res.status },
          )
        }
        break
      }

      const slice = (await res.json().catch(() => ({}))) as VincereSliceResp
      const arr = Array.isArray(slice?.content) ? slice.content : []

      // derive total from header or body on first slice if available
      if (sliceIndex === 0) {
        const headerTotalStr = res.headers.get('x-vincere-total')
        const headerTotal =
          headerTotalStr && headerTotalStr.trim() !== ''
            ? Number(headerTotalStr)
            : NaN
        if (typeof slice.totalElements === 'number') {
          total = slice.totalElements
        } else if (!Number.isNaN(headerTotal)) {
          total = headerTotal
        } else {
          total = null
        }
      }

      for (const c of arr) {
        if (contacts.length >= limit) break
        contacts.push({
          first_name: c?.first_name ?? c?.firstname ?? c?.firstName ?? '',
          last_name: c?.last_name ?? c?.lastname ?? c?.lastName ?? '',
          email:
            c?.email ??
            c?.email1 ??
            c?.primary_email ??
            c?.email_address ??
            c?.contact_email ??
            '',
        })
      }

      last = !!slice?.last
      sliceIndex += 1
      slicesFetched += 1
    }

    const resp = NextResponse.json(
      {
        contacts,
        meta: { total, slicesFetched, previewLimit: limit },
      },
      { status: 200 },
    )

    if (typeof total === 'number') {
      resp.headers.set('x-vincere-total', String(total))
    }

    return resp
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Unexpected error', details: e?.message || String(e) },
      { status: 500 },
    )
  }
}

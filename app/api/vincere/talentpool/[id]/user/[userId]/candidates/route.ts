// app/api/vincere/talentpool/[id]/user/[userId]/candidates/route.ts
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
}

type VincereGetCandidatesResp = {
  totalElements?: number
  content?: Array<{ id?: number | string }>
}

function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

// Generic fetch that retries once after refreshing the Vincere id token
async function fetchWithRefresh(
  userKey: string,
  url: string,
  init: RequestInit & { headers?: Record<string, string> }
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

export async function GET(
  req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const { id, userId } = params
    if (!id || !userId) {
      return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 })
    }

    const session = await getSession()
    const userKey = session.user?.email ?? 'unknown'

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    const { searchParams } = new URL(req.url)
    // support new ?limit and legacy ?rows
    const limitRaw = searchParams.get('limit') ?? searchParams.get('rows') ?? '50'
    const limit = Math.max(1, Math.min(200, Number(limitRaw) || 50))

    // 1) Get preview IDs + TOTAL via POST /talentpools/{id}/getCandidates
    const idsRes = await fetchWithRefresh(
      userKey,
      `${BASE}/talentpools/${encodeURIComponent(id)}/getCandidates`,
      {
        method: 'POST',
        body: JSON.stringify({
          returnField: { fieldList: ['id'] },
          page: 0,
          pageSize: limit,     // ask the API for exactly our preview size
          responseType: 'VALUE',
          totalRequired: true, // <-- ensures totalElements is included
        }),
      }
    )

    if (!idsRes.ok) {
      const t = await idsRes.text().catch(() => '')
      return NextResponse.json(
        { error: `Vincere getCandidates failed (${idsRes.status})`, details: t },
        { status: idsRes.status }
      )
    }

    const idsJson = (await idsRes.json()) as VincereGetCandidatesResp
    const total = typeof idsJson?.totalElements === 'number' ? idsJson.totalElements : null

    // 2) Fetch candidate details via GET /talentpool/{id}/user/{userId}/candidates?index=N
    // Iterate slices until we have >= limit or "last" is true (max 400 slices per API docs)
    const candidates: Array<{ first_name?: string; last_name?: string; email?: string }> = []
    let sliceIndex = 0
    let last = false
    let slicesFetched = 0

    while (!last && candidates.length < limit && sliceIndex < 400) {
      const sliceRes = await fetchWithRefresh(
        userKey,
        `${BASE}/talentpool/${encodeURIComponent(id)}/user/${encodeURIComponent(
          userId
        )}/candidates?index=${sliceIndex}`,
        { method: 'GET' }
      )

      if (!sliceRes.ok) {
        // If the first slice fails, return an error; otherwise stop and return what we have
        if (sliceIndex === 0) {
          const body = await sliceRes.text().catch(() => '')
          return NextResponse.json(
            { error: `Vincere slice fetch failed (${sliceRes.status})`, details: body },
            { status: sliceRes.status }
          )
        }
        break
      }

      const slice = (await sliceRes.json()) as VincereSliceResp
      const arr = Array.isArray(slice?.content) ? slice.content : []
      for (const c of arr) {
        if (candidates.length >= limit) break
        candidates.push({
          first_name: c?.first_name ?? c?.firstname ?? c?.firstName ?? '',
          last_name: c?.last_name ?? c?.lastname ?? c?.lastName ?? '',
          email: c?.email ?? c?.email1 ?? c?.email_address ?? '',
        })
      }

      last = !!slice?.last
      sliceIndex += 1
      slicesFetched += 1
    }

    const resp = NextResponse.json(
      {
        candidates,
        meta: { total, slicesFetched, previewLimit: limit },
      },
      { status: 200 }
    )
    if (typeof total === 'number') resp.headers.set('x-vincere-total', String(total))
    return resp
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Unexpected error', details: e?.message || String(e) },
      { status: 500 }
    )
  }
}

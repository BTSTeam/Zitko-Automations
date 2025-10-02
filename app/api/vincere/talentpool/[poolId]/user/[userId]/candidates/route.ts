// app/api/vincere/talentpool/[poolId]/user/[userId]/candidates/route.ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'
import { requiredEnv } from '@/lib/config'

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

const BASE = requiredEnv('VINCERE_API_BASE') // e.g. https://api.vincere.io/api/v2
const API_KEY = requiredEnv('VINCERE_API_KEY')

/**
 * Helper: issue a Vincere request with the current id token.
 * If 401/403, refresh the id token and retry once.
 */
async function fetchWithRefresh(
  url: string,
  init: RequestInit & { headers?: Record<string, string> }
) {
  const session = await getSession()
  let idToken = session.tokens?.idToken || session.tokens?.id_token || session.idToken

  const doFetch = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

  let res = await doFetch(idToken)
  if (res.status === 401 || res.status === 403) {
    // try refresh once
    const refreshed = await refreshIdToken()
    if (!refreshed?.idToken) return res
    idToken = refreshed.idToken
    res = await doFetch(idToken)
  }
  return res
}

export async function GET(
  req: Request,
  { params }: { params: { poolId: string; userId: string } }
) {
  try {
    const { poolId, userId } = params
    if (!poolId || !userId) {
      return NextResponse.json({ error: 'Missing poolId or userId' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    // support new ?limit and legacy ?rows
    const limitRaw = searchParams.get('limit') ?? searchParams.get('rows') ?? '50'
    const limit = Math.max(1, Math.min(200, Number(limitRaw) || 50))

    // 1) Get IDs + TOTAL using POST /talentpools/{id}/getCandidates
    const idsRes = await fetchWithRefresh(
      `${BASE}/talentpools/${encodeURIComponent(poolId)}/getCandidates`,
      {
        method: 'POST',
        body: JSON.stringify({
          returnField: { fieldList: ['id'] },
          page: 0,
          pageSize: limit, // ask Vincere for exactly what we want in preview
          responseType: 'VALUE',
          totalRequired: true, // <-- crucial to receive totalElements
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

    // 2) Fetch candidate details from GET /talentpool/{id}/user/{user_id}/candidates?index=#
    // Each index returns a fixed-size "slice". Iterate until we have >= limit or last=true.
    const candidates: Array<{ first_name?: string; last_name?: string; email?: string }> = []
    let sliceIndex = 0
    let last = false
    let slicesFetched = 0

    while (!last && candidates.length < limit && sliceIndex < 400) {
      const sliceRes = await fetchWithRefresh(
        `${BASE}/talentpool/${encodeURIComponent(poolId)}/user/${encodeURIComponent(
          userId
        )}/candidates?index=${sliceIndex}`,
        { method: 'GET' }
      )

      if (!sliceRes.ok) {
        // If the first slice fails, bail; otherwise break and return what we have.
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
      // Normalise minimal fields we show in the UI
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
        meta: {
          total,
          slicesFetched,
          previewLimit: limit,
        },
      },
      {
        status: 200,
      }
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

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

// Retained as a lenient fallback parser in case the API shape changes
function parseTotal(d: any): number | null {
  const n =
    (typeof d?.totalElements === 'number' && d.totalElements) ||
    (typeof d?.numFound === 'number' && d.numFound) ||
    (typeof d?.total === 'number' && d.total) ||
    (typeof d?.count === 'number' && d.count) ||
    (typeof d?.totalCount === 'number' && d.totalCount) ||
    (typeof d?.meta?.total === 'number' && d.meta.total) ||
    (typeof d?.hits?.total?.value === 'number' && d.hits.total.value) ||
    null
  return typeof n === 'number' ? n : null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    const headers = new Headers({
      'content-type': 'application/json',
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      // keep these for compatibility with your other routes
      'id-token': idToken,
      accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    })

    const doPost = (body: any) =>
      fetch(`${BASE}/talentpools/${encodeURIComponent(params.id)}/getCandidates`, {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify(body),
      })

    // Ask for just 1 record but require the API to include the overall total
    const firstBody = {
      returnField: { fieldList: ['id'] },
      page: 0,
      pageSize: 1,
      responseType: 'VALUE',
      totalRequired: true,
    }

    let res = await doPost(firstBody)

    // Refresh id token on 401/403 and retry once
    if (res.status === 401 || res.status === 403) {
      const ok = await refreshIdToken(userKey)
      if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
      session = await getSession()
      idToken = session.tokens?.idToken
      headers.set('id-token', idToken || '')
      headers.set('Authorization', `Bearer ${idToken}`)
      res = await doPost(firstBody)
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Vincere getCandidates failed (${res.status})`, details: txt },
        { status: res.status }
      )
    }

    const data = await res.json().catch(() => ({}))
    const total = parseTotal(data)

    const response = NextResponse.json(
      { total: typeof total === 'number' ? total : null },
      { status: 200 }
    )
    if (typeof total === 'number') response.headers.set('x-vincere-total', String(total))
    return response
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

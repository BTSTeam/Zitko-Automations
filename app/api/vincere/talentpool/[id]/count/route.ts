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

function parseTotal(d: any): number | null {
  const n =
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
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)
    const headers = new Headers({
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    })
    const doFetch = (url: string) => fetch(url, { headers, cache: 'no-store' })

    const keys = ['talent_pool_id', 'talentpool_id', 'talentPoolId', 'pool_id'] as const
    const fl = encodeURIComponent('id')
    for (const key of keys) {
      const url = `${BASE}/candidate/search?${key}=${encodeURIComponent(params.id)}&fl=${fl}&rows=1&start=0`
      let res = await doFetch(url)
      if (res.status === 401 || res.status === 403) {
        const ok = await refreshIdToken(userKey)
        if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
        session = await getSession()
        idToken = session.tokens?.idToken
        headers.set('id-token', idToken || '')
        headers.set('Authorization', `Bearer ${idToken}`)
        res = await doFetch(url)
      }
      const data = await res.json().catch(() => ({}))
      const total = parseTotal(data)
      if (typeof total === 'number') {
        return NextResponse.json(
          { total },
          { status: 200, headers: { 'x-vincere-total': String(total) } }
        )
      }
    }
    return NextResponse.json({ total: null }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

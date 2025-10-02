export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

// Ensure base includes /api/v2
function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
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

    const RAW_BASE = config.VINCERE_TENANT_API_BASE
    const BASE = withApiV2(RAW_BASE) // ✅ guarantees /api/v2 is present

    // If you have a dedicated endpoint for pool candidates, replace this path.
    // Using candidate search filtered by pool ID and limiting fields.
    const fl = encodeURIComponent('first_name,last_name,email')
    const url = `${BASE}/candidate/search?talent_pool_id=${encodeURIComponent(params.id)}&fl=${fl}&rows=500`

    const headers = new Headers({
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    })

    const doFetch = () => fetch(url, { method: 'GET', headers, cache: 'no-store' })

    let res = await doFetch()
    if (res.status === 401 || res.status === 403) {
      const ok = await refreshIdToken(userKey)
      if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
      session = await getSession()
      idToken = session.tokens?.idToken
      if (!idToken) return NextResponse.json({ error: 'No idToken after refresh' }, { status: 401 })
      headers.set('id-token', idToken)
      headers.set('Authorization', `Bearer ${idToken}`)
      res = await doFetch()
    }

    const data = await res.json().catch(() => ({}))

    const rows = Array.isArray((data as any)?.docs)
      ? (data as any).docs
      : Array.isArray((data as any)?.items)
      ? (data as any).items
      : Array.isArray(data)
      ? (data as any)
      : []

    const candidates = rows.map((r: any) => ({
      first_name: r.first_name ?? r.firstName ?? '',
      last_name:  r.last_name  ?? r.lastName  ?? '',
      email:      r.email      ?? '',
    }))

    return NextResponse.json(
      { candidates },
      { status: 200, headers: { 'x-vincere-base': BASE } } // ✅ quick verification
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

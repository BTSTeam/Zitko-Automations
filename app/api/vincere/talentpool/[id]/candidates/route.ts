export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    const idToken = session.tokens?.idToken        // ✅ camelCase
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    // Adjust to your exact Vincere endpoint if different:
    const fl = encodeURIComponent('first_name,last_name,email')
    const url = `${BASE}/candidate/search?talent_pool_id=${encodeURIComponent(params.id)}&fl=${fl}&rows=500`

    const headers = new Headers()
    headers.set('id-token', idToken)                                     // ✅ keep header as 'id-token'
    headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY)
    headers.set('accept', 'application/json')

    const doFetch = () => fetch(url, { method: 'GET', headers, cache: 'no-store' })

    let res = await doFetch()
    if (res.status === 401 || res.status === 403) {
      const fresh = await refreshIdToken(userKey)
      if (!fresh) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
      headers.set('id-token', fresh)
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

    return NextResponse.json({ candidates }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

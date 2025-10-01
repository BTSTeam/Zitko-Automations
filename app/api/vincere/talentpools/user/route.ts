export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

function makeUserId(u: any): string {
  const first = (u?.first_name || u?.firstName || '').trim().toLowerCase()
  const last  = (u?.last_name  || u?.lastName  || '').trim().toLowerCase()
  const clean = (s: string) => s.replace(/[^a-z0-9]+/g, '')
  const f = clean(first)
  const l = clean(last)
  if (f || l) return [f, l].filter(Boolean).join('_')

  const email = (u?.email || '').toLowerCase()
  if (email.includes('@')) {
    const local = email.split('@')[0]
    return local.replace(/\./g, '_').replace(/[^a-z0-9_]+/g, '') || 'unknown_user'
  }
  return 'unknown_user'
}

export async function GET(_req: NextRequest) {
  try {
    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    const userId = makeUserId(session.user)
    const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const url = `${BASE}/talentpools/user/${encodeURIComponent(userId)}`

    const headers = new Headers()
    headers.set('id-token', idToken)
    headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY)
    headers.set('accept', 'application/json')

    const doFetch = () => fetch(url, { method: 'GET', headers, cache: 'no-store' })

    let res = await doFetch()
    if (res.status === 401 || res.status === 403) {
      const ok = await refreshIdToken(userKey)   // boolean
      if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })

      // 🔁 re-read session to get the updated token
      session = await getSession()
      idToken = session.tokens?.idToken
      if (!idToken) return NextResponse.json({ error: 'No idToken after refresh' }, { status: 401 })
      headers.set('id-token', idToken)

      res = await doFetch()
    }

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

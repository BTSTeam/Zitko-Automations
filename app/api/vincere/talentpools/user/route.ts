export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

// 🔒 Hardcoded per your request:
const VINCERE_TALENTPOOL_USER_ID = '29018'

export async function GET(_req: NextRequest) {
  try {
    // Requires an active Vincere connection (same as your other Vincere routes)
    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'

    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    // Per your spec: GET /talentpools/user/{user_id}
    const url = `${BASE}/talentpools/user/${encodeURIComponent(VINCERE_TALENTPOOL_USER_ID)}`

    const headers = new Headers()
    headers.set('id-token', idToken) // matches your existing Vincere proxy pattern
    headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY)
    headers.set('accept', 'application/json')
    // Optional: some tenants accept Bearer too
    headers.set('Authorization', `Bearer ${idToken}`)

    const doFetch = () => fetch(url, { method: 'GET', headers, cache: 'no-store' })

    let res = await doFetch()
    if (res.status === 401 || res.status === 403) {
      const ok = await refreshIdToken(userKey) // boolean in your codebase
      if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })

      // Re-read session for fresh token
      session = await getSession()
      idToken = session.tokens?.idToken
      if (!idToken) return NextResponse.json({ error: 'No idToken after refresh' }, { status: 401 })

      headers.set('id-token', idToken)
      headers.set('Authorization', `Bearer ${idToken}`)

      res = await doFetch()
    }

    const data = await res.json().catch(() => ({}))

    // Include which user_id we used for easy debugging
    return NextResponse.json(data, {
      status: res.status,
      headers: { 'x-vincere-userid': VINCERE_TALENTPOOL_USER_ID },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

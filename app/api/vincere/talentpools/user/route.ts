export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

/**
 * Build firstname_surname from the current session.
 * - Uses first_name/last_name if present
 * - Else splits "name" into [first, last]
 * - Falls back to email local-part if needed
 * - Lowercases and joins with underscore (firstname_surname)
 */
function buildFirstnameSurname(u: any): string {
  const clean = (s?: string) => (s ?? '').trim()
  let first = clean(u?.first_name ?? u?.firstName)
  let last  = clean(u?.last_name  ?? u?.lastName)

  if (!first || !last) {
    const name = clean(u?.name)
    if (name) {
      const parts = name.split(/\s+/)
      if (!first && parts[0]) first = parts[0]
      if (!last  && parts[1]) last  = parts.slice(1).join(' ')
    }
  }

  if ((!first || !last) && u?.email) {
    // very last resort: email local-part -> try split on dots/underscores
    const local = String(u.email).toLowerCase().split('@')[0]
    const segs = local.split(/[._-]+/).filter(Boolean)
    if (!first && segs[0]) first = segs[0]
    if (!last  && segs[1])  last = segs.slice(1).join('_')
  }

  first = (first || 'unknown').toLowerCase().replace(/\s+/g, '_')
  last  = (last  || 'user').toLowerCase().replace(/\s+/g, '_')
  return `${first}_${last}`.replace(/_+/g, '_')
}

export async function GET(req: NextRequest) {
  try {
    // optional override for quick testing: /api/vincere/talentpools/user?userId=john_smith
    const override = new URL(req.url).searchParams.get('userId') || undefined

    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    const resolvedUserId = override ?? buildFirstnameSurname(session.user)
    const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    // Your spec: GET /talentpools/user/{firstname_surname}
    const url = `${BASE}/talentpools/user/${encodeURIComponent(resolvedUserId)}`

    const headers = new Headers()
    headers.set('id-token', idToken) // matches your existing Vincere code
    headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY)
    headers.set('accept', 'application/json')
    // bonus: add Authorization just in case your tenant accepts bearer too
    headers.set('Authorization', `Bearer ${idToken}`)

    const doFetch = () => fetch(url, { method: 'GET', headers, cache: 'no-store' })

    let res = await doFetch()
    if (res.status === 401 || res.status === 403) {
      const ok = await refreshIdToken(userKey)   // boolean in your codebase
      if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
      // re-read session for fresh token
      session = await getSession()
      idToken = session.tokens?.idToken
      if (!idToken) return NextResponse.json({ error: 'No idToken after refresh' }, { status: 401 })
      headers.set('id-token', idToken)
      headers.set('Authorization', `Bearer ${idToken}`)
      res = await doFetch()
    }

    const data = await res.json().catch(() => ({}))
    // Return the payload and a helpful header so you can see what we called Vincere with
    return NextResponse.json(data, {
      status: res.status,
      headers: { 'x-vincere-userid': resolvedUserId }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

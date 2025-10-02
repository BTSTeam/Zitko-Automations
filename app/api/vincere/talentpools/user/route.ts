export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

function unwrapToArray(json: any): any[] {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.items)) return json.items
  if (Array.isArray(json?.data?.items)) return json.data.items
  if (Array.isArray(json?.data)) return json.data
  if (Array.isArray(json?.docs)) return json.docs
  if (Array.isArray(json?.results)) return json.results
  if (Array.isArray(json?.pools)) return json.pools
  if (Array.isArray(json?.content)) return json.content // Vincere paging shape
  return []
}

// Safe session token reader (supports both shapes used in your app)
function getIdTokenFromSession(session: any): string | null {
  return session?.vincere?.id_token ?? session?.tokens?.idToken ?? null
}

// Try to find a sensible userId to query pools for
function getUserId(session: any): string | null {
  // Highest priority: explicit env
  const envUser = process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID
  if (envUser) return String(envUser)

  // Session-derived fallbacks (adapt if you store it elsewhere)
  return (
    session?.vincere?.user_id ??
    session?.user?.id ??
    session?.user?.userId ??
    null
  )
}

export async function GET() {
  try {
    let session: any = await getSession()
    let idToken = getIdTokenFromSession(session)
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    const userId = getUserId(session)
    if (!userId) {
      return NextResponse.json({ error: 'No Vincere userId available' }, { status: 400 })
    }

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)
    // Vincere endpoint pattern for pools by user
    const upstreamUrl = `${BASE}/talentpools/user/${encodeURIComponent(String(userId))}`

    const headers = new Headers({
      accept: 'application/json',
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      Authorization: `Bearer ${idToken}`,
    })

    const doFetch = () => fetch(upstreamUrl, { method: 'GET', headers, cache: 'no-store' })
    let res = await doFetch()

    if (res.status === 401 || res.status === 403) {
      // Support both refresh signatures used elsewhere in your app
      const maybeUserKey = session?.user?.email ?? 'unknown'
      let refreshedOk = false
      try {
        const refreshed = await (refreshIdToken as any)(session)
        refreshedOk = !!refreshed
      } catch {
        try {
          const refreshed = await (refreshIdToken as any)(maybeUserKey)
          refreshedOk = !!refreshed
        } catch {
          refreshedOk = false
        }
      }
      if (!refreshedOk) {
        return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
      }
      session = await getSession()
      idToken = getIdTokenFromSession(session)
      if (!idToken) {
        return NextResponse.json({ error: 'No idToken after refresh' }, { status: 401 })
      }
      headers.set('id-token', idToken)
      headers.set('Authorization', `Bearer ${idToken}`)
      res = await doFetch()
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: 'Upstream error', status: res.status, text },
        { status: 502, headers: { 'x-vincere-upstream': upstreamUrl } }
      )
    }

    const raw = await res.json().catch(() => ({}))
    const arr = unwrapToArray(raw)

    // Map to the UI shape your tab expects
    const items = arr
      .filter((x: any) => x && typeof x === 'object')
      .map((p: any) => ({
        id: p.id ?? p.pool_id ?? p.talent_pool_id ?? String(p?.uid ?? ''),
        name: p.name ?? p.title ?? p.pool_name ?? '(unnamed pool)',
      }))
      .filter((p) => p.id)

    return NextResponse.json(
      { items, meta: { upstream: upstreamUrl, count: items.length } },
      {
        status: 200,
        headers: {
          'x-vincere-base': BASE,
          'x-vincere-userid': String(userId),
          'x-vincere-upstream': upstreamUrl,
        },
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

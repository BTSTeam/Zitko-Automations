export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

// Hardcoded per your instruction
const VINCERE_TALENTPOOL_USER_ID =
  process.env.VINCERE_TALENTPOOL_USER_ID?.trim() || '29018'

type Pool = { id?: string | number; name?: string; [k: string]: any }

function normalizePoolsFromData(data: any): Pool[] {
  // Accept a variety of containers
  const raw =
    (Array.isArray(data?.pools) && data.pools) ||
    (Array.isArray(data?.talentPools) && data.talentPools) ||
    (Array.isArray(data?.talent_pools) && data.talent_pools) ||
    (Array.isArray(data?.docs) && data.docs) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.results) && data.results) ||
    (Array.isArray(data) ? data : [])

  // Map a bunch of possible field names to { id, name }
  const mapped: Pool[] = raw
    .map((p: any) => {
      const id =
        p?.id ??
        p?.pool_id ??
        p?.talent_pool_id ??
        p?.talentPoolId ??
        p?.uid ??
        p?.value ??
        p?.key

      const name =
        p?.name ??
        p?.pool_name ??
        p?.poolName ??
        p?.title ??
        p?.label ??
        p?.displayName

      return { id, name, ...p }
    })
    .filter((p) => p.id)

  return mapped
}

export async function GET(_req: NextRequest) {
  try {
    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const urls = [
      `${BASE}/talentpools/user/${encodeURIComponent(VINCERE_TALENTPOOL_USER_ID)}`, // plural
      `${BASE}/talentpool/user/${encodeURIComponent(VINCERE_TALENTPOOL_USER_ID)}`,  // singular fallback
    ]

    const headers = new Headers()
    headers.set('id-token', idToken)
    headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY)
    headers.set('accept', 'application/json')
    headers.set('Authorization', `Bearer ${idToken}`)

    const doFetch = (url: string) =>
      fetch(url, { method: 'GET', headers, cache: 'no-store' })

    const tried: Array<{ url: string; status?: number; count?: number }> = []

    // Try primary path
    let res = await doFetch(urls[0])
    let data: any = await res.json().catch(() => ({}))
    let pools = normalizePoolsFromData(data)
    tried.push({ url: urls[0], status: res.status, count: pools.length })

    // If unauthorized, refresh then retry the same URL
    if ((res.status === 401 || res.status === 403)) {
      const ok = await refreshIdToken(userKey)
      if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
      session = await getSession()
      idToken = session.tokens?.idToken
      if (!idToken) return NextResponse.json({ error: 'No idToken after refresh' }, { status: 401 })
      headers.set('id-token', idToken)
      headers.set('Authorization', `Bearer ${idToken}`)

      res = await doFetch(urls[0])
      data = await res.json().catch(() => ({}))
      pools = normalizePoolsFromData(data)
      tried.push({ url: urls[0] + ' (after refresh)', status: res.status, count: pools.length })
    }

    // If still empty or 404, try the fallback singular path
    if ((!Array.isArray(pools) || pools.length === 0) || res.status === 404) {
      const res2 = await doFetch(urls[1])
      const data2 = await res2.json().catch(() => ({}))
      const pools2 = normalizePoolsFromData(data2)
      tried.push({ url: urls[1], status: res2.status, count: pools2.length })
      if (pools2.length > 0) {
        return NextResponse.json(
          { pools: pools2, tried },
          {
            status: 200,
            headers: { 'x-vincere-userid': VINCERE_TALENTPOOL_USER_ID },
          },
        )
      }
    }

    return NextResponse.json(
      { pools, tried },
      {
        status: 200,
        headers: { 'x-vincere-userid': VINCERE_TALENTPOOL_USER_ID },
      },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

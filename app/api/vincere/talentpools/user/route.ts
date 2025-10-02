export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

// Hardcoded per your instruction (can make env-driven later)
const VINCERE_TALENTPOOL_USER_ID =
  process.env.VINCERE_TALENTPOOL_USER_ID?.trim() || '29018'

// Ensure base includes /api/v2
function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

type Pool = { id?: string | number; name?: string; [k: string]: any }

function normalizePools(data: any): Pool[] {
  const raw =
    (Array.isArray(data?.pools) && data.pools) ||
    (Array.isArray(data?.talentPools) && data.talentPools) ||
    (Array.isArray(data?.talent_pools) && data.talent_pools) ||
    (Array.isArray(data?.docs) && data.docs) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.results) && data.results) ||
    (Array.isArray(data) ? data : [])

  return raw
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
    .filter((p: Pool) => p.id)
}

export async function GET(_req: NextRequest) {
  try {
    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })

    const RAW_BASE = config.VINCERE_TENANT_API_BASE
    const BASE = withApiV2(RAW_BASE) // ✅ guarantees /api/v2 is present

    const url = `${BASE}/talentpools/user/${encodeURIComponent(VINCERE_TALENTPOOL_USER_ID)}`

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
    const pools = normalizePools(data)

    return NextResponse.json(
      { pools },
      {
        status: 200,
        headers: {
          'x-vincere-userid': VINCERE_TALENTPOOL_USER_ID,
          'x-vincere-base': BASE, // ✅ for quick verification in DevTools
        },
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

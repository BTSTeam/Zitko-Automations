// app/api/sourcing/industries/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type VincereIndustry = { id: number | string; name?: string } & Record<string, any>
type IndustryOut = { id: number; name: string }

/* ----------------------------- helpers ----------------------------- */

async function ensureVincereToken(): Promise<string | null> {
  try {
    requiredEnv()
  } catch {
    return null
  }

  const session = await getSession()
  let idTok = session?.tokens?.idToken
  if (idTok) return idTok

  const ok = await refreshIdToken('default')
  if (!ok) return null

  const session2 = await getSession()
  return session2?.tokens?.idToken ?? null
}

function toInt(n: unknown, def = 100): number {
  const x = Math.floor(Number(n))
  return Number.isFinite(x) && x > 0 ? x : def
}

/**
 * Some Vincere tenants expose industries at /api/v2/industries, others at /api/v2/industry.
 * We try the plural first, then fall back to the singular path if needed.
 */
async function fetchIndustriesPaged(args: {
  idToken: string
  search?: string
  pageSize?: number
}): Promise<VincereIndustry[]> {
  const { idToken, search } = args
  const size = toInt(args.pageSize ?? 200, 200) // grab big pages to minimize roundtrips
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const paths = ['/api/v2/industries', '/api/v2/industry'] // try in this order

  const all: VincereIndustry[] = []

  for (const path of paths) {
    let page = 1
    let usedPath = path
    let hadAny = false

    while (true) {
      const url = new URL(`${base}${usedPath}`)
      url.searchParams.set('page', String(page))
      url.searchParams.set('size', String(size))
      // Request only what we need when supported
      url.searchParams.set('fl', 'id,name')

      if (search) {
        const safe = search.replace(/"/g, '\\"')
        // Use Vincere keyword query: name:"term"
        url.searchParams.set('q', `name:"${safe}"#`)
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.VINCERE_API_KEY!,
          Authorization: `Bearer ${idToken}`,
          'Cache-Control': 'no-store',
        },
      })

      if (!res.ok) {
        // If the first path (plural) 404s, try the next path in the outer loop.
        if (res.status === 404 && usedPath === '/api/v2/industries') {
          break
        }
        // For other errors, bubble up a readable error
        const text = await res.text().catch(() => '')
        throw new Error(`Vincere industries error ${res.status}: ${text}`)
      }

      const json = (await res.json()) as any
      const items: VincereIndustry[] = Array.isArray(json?.items) ? json.items : []

      if (!items.length) {
        if (!hadAny && usedPath === '/api/v2/industries') {
          // No items and no error—tenant might be using singular path; break to try it.
          break
        }
        // Finished paging this path
        break
      }

      hadAny = true
      all.push(...items)
      // Stop if fewer than requested -> last page reached
      if (items.length < size) break
      page += 1
    }

    if (all.length) break // we succeeded with this path; no need to try others
  }

  return all
}

/* -------------------------------- GET -------------------------------- */

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get('search') || undefined
    const idToken = await ensureVincereToken()
    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing Vincere credentials (env or token)' },
        { status: 500 },
      )
    }

    const raw = await fetchIndustriesPaged({ idToken, search })
    const cleaned: IndustryOut[] = raw
      .map((x) => ({
        id: Number(x.id),
        name: String(x.name ?? '').trim(),
      }))
      .filter((x) => Number.isFinite(x.id) && x.name.length > 0)
      // Deduplicate by id (just in case)
      .filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i)
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ results: cleaned, total: cleaned.length }, { status: 200 })
  } catch (e: any) {
    console.error('industries route error', e)
    return NextResponse.json({ error: e?.message || 'Unknown server error' }, { status: 500 })
  }
}

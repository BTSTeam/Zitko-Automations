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

type Norm = { first_name: string; last_name: string; email: string }

function extractEmail(c: any): string {
  return (
    c?.email ??
    c?.primary_email ??
    c?.candidate_email ??
    c?.contact_email ??
    c?.emailAddress ??
    c?.contact?.email ??
    c?.person?.email ??
    (Array.isArray(c?.emails) && c.emails[0]?.email) ??
    ''
  )
}

function flattenArraysDeep(obj: any): any[] {
  const out: any[] = []
  const seen = new Set<any>()
  const walk = (v: any) => {
    if (!v || seen.has(v)) return
    seen.add(v)
    if (Array.isArray(v)) out.push(v)
    else if (typeof v === 'object') for (const k of Object.keys(v)) walk(v[k])
  }
  walk(obj)
  return out.flat()
}

function normalizeCandidates(data: any): Norm[] {
  const arr =
    (Array.isArray(data?.candidates) && data.candidates) ||
    (Array.isArray(data?.docs) && data.docs) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.results) && data.results) ||
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.content) && data.content) ||
    (Array.isArray(data) ? data : flattenArraysDeep(data))

  return (arr || [])
    .filter((x: any) => x && typeof x === 'object')
    .map((r: any) => {
      let first = r.first_name ?? r.firstName ?? ''
      let last = r.last_name ?? r.lastName ?? ''
      if ((!first || !last) && typeof r.name === 'string') {
        const parts = r.name.trim().split(/\s+/)
        first = first || parts[0] || ''
        last = last || parts.slice(1).join(' ') || ''
      }
      const email = extractEmail(r) || ''
      return {
        first_name: String(first || '').trim(),
        last_name: String(last || '').trim(),
        email: String(email || '').trim(),
      }
    })
}

/** Try to parse a "total results" field from various Vincere/ES styles */
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

/** Append rows= to a URL (harmless if upstream ignores it) */
function withRows(url: string, rows: number): string {
  return url.includes('?') ? `${url}&rows=${rows}` : `${url}?rows=${rows}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    // allow ?rows= to control preview size; default 500
    const rows = Math.max(1, Number(req.nextUrl.searchParams.get('rows') ?? 500))

    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    // Try a few likely upstreams, requesting rows where possible
    const upstreams: string[] = [
      // exact spec (singular)
      `${BASE}/talentpool/${encodeURIComponent(params.id)}/user/${encodeURIComponent(
        params.userId
      )}/candidates`,
      // plural variant (some tenants use plural)
      `${BASE}/talentpools/${encodeURIComponent(params.id)}/user/${encodeURIComponent(
        params.userId
      )}/candidates`,
      // without /user/
      `${BASE}/talentpool/${encodeURIComponent(params.id)}/candidates`,
      `${BASE}/talentpools/${encodeURIComponent(params.id)}/candidates`,
    ].map((u) => withRows(u, rows))

    const headers = new Headers({
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    })

    const doFetch = (url: string) =>
      fetch(url, { method: 'GET', headers, cache: 'no-store' })
    const tried: Array<{ url: string; status?: number; count?: number }> = []

    let finalCandidates: Norm[] = []
    let finalUrl = upstreams[0]
    let poolTotal: number | null = null

    // 1) Try each upstream endpoint until we get rows
    for (const url of upstreams) {
      finalUrl = url
      let res = await doFetch(url)
      if (res.status === 401 || res.status === 403) {
        const ok = await refreshIdToken(userKey)
        if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
        session = await getSession()
        idToken = session.tokens?.idToken
        if (!idToken) return NextResponse.json({ error: 'No idToken after refresh' }, { status: 401 })
        headers.set('id-token', idToken)
        headers.set('Authorization', `Bearer ${idToken}`)
        res = await doFetch(url)
      }
      const data = await res.json().catch(() => ({}))
      // attempt to pick up a total if this payload includes one
      poolTotal = poolTotal ?? parseTotal(data)

      const norm = normalizeCandidates(data)
      tried.push({ url, status: res.status, count: norm.length })
      if (norm.length) {
        finalCandidates = norm
        break
      }
    }

    // 2) If still no rows, use search fallbacks (explicit rows=)
    if (!finalCandidates.length) {
      const fl = encodeURIComponent('first_name,last_name,email')
      const searches = [
        `${BASE}/candidate/search?talent_pool_id=${encodeURIComponent(params.id)}&fl=${fl}&rows=${rows}`,
        `${BASE}/candidate/search?talentpool_id=${encodeURIComponent(params.id)}&fl=${fl}&rows=${rows}`,
        `${BASE}/candidate/search?talentPoolId=${encodeURIComponent(params.id)}&fl=${fl}&rows=${rows}`,
        `${BASE}/candidate/search?pool_id=${encodeURIComponent(params.id)}&fl=${fl}&rows=${rows}`,
      ]
      for (const s of searches) {
        let res = await doFetch(s)
        const data = await res.json().catch(() => ({}))
        poolTotal = poolTotal ?? parseTotal(data)

        const norm = normalizeCandidates(data)
        tried.push({ url: s, status: res.status, count: norm.length })
        if (norm.length) {
          finalCandidates = norm
          finalUrl = s
          break
        }
      }
    }

    return NextResponse.json(
      {
        candidates: finalCandidates,
        meta: {
          upstream: finalUrl,
          count: finalCandidates.length,
          total: poolTotal, // ← true pool size when the API exposes it
          tried,
          rowsRequested: rows,
        },
      },
      {
        status: 200,
        headers: {
          'x-vincere-base': BASE,
          'x-vincere-userid': params.userId,
          'x-vincere-upstream': finalUrl,
          'x-vincere-total': poolTotal != null ? String(poolTotal) : '',
          'x-rows': String(rows),
        },
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

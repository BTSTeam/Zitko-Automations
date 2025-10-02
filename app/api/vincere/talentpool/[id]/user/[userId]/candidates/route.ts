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
      let last  = r.last_name  ?? r.lastName  ?? ''
      if ((!first || !last) && typeof r.name === 'string') {
        const parts = r.name.trim().split(/\s+/)
        first = first || parts[0] || ''
        last  = last  || parts.slice(1).join(' ') || ''
      }
      const email = extractEmail(r) || ''
      return {
        first_name: String(first || '').trim(),
        last_name:  String(last || '').trim(),
        email:      String(email || '').trim(),
      }
    })
}

/** Try typical header fields for totals (case-insensitive). */
function parseTotalFromHeaders(h: Headers): number | null {
  const keys = [
    'x-total',
    'x-total-count',
    'x-total-results',
    'x-total-records',
    'x-count',
    'x-pagination-total',
  ]
  for (const k of keys) {
    const v = h.get(k) || h.get(k.toUpperCase())
    if (v && !Number.isNaN(Number(v))) return Number(v)
  }
  const cr = h.get('content-range') || h.get('Content-Range')
  // e.g. "items 0-24/11234" or "0-24/11234"
  if (cr) {
    const m = cr.match(/\/\s*(\d+)\s*$/)
    if (m) return Number(m[1])
  }
  return null
}

/** Pull totals from common JSON shapes. Falls back to a cautious deep scan. */
function parseTotalFromJson(d: any): number | null {
  if (!d || typeof d !== 'object') return null
  const direct =
    (typeof d.numFound === 'number' && d.numFound) ||
    (typeof d.total === 'number' && d.total) ||
    (typeof d.count === 'number' && d.count) ||
    (typeof d.totalCount === 'number' && d.totalCount) ||
    (typeof d.recordsTotal === 'number' && d.recordsTotal) ||
    (typeof d.totalRecords === 'number' && d.totalRecords) ||
    (typeof d.totalElements === 'number' && d.totalElements) ||
    (typeof d?.meta?.total === 'number' && d.meta.total) ||
    (typeof d?.meta?.total_count === 'number' && d.meta.total_count) ||
    (typeof d?.hits?.total?.value === 'number' && d.hits.total.value) ||
    (typeof d?.pagination?.total === 'number' && d.pagination.total) ||
    (typeof d?.page?.total === 'number' && d.page.total) ||
    (typeof d?.page?.totalRows === 'number' && d.page.totalRows) ||
    (typeof d?.page?.total_elements === 'number' && d.page.total_elements) ||
    null
  if (typeof direct === 'number') return direct

  // careful deep scan
  let found: number | null = null
  const seen = new Set<any>()
  const walk = (v: any) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'number' && /total|numfound|recordsTotal|totalCount|totalElements/i.test(k)) {
        if (val > 0 && (found == null || val > found)) found = val
      } else if (val && typeof val === 'object') {
        walk(val)
      }
    }
  }
  walk(d)
  return found
}

function qs(u: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(u)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    // How many rows to preview in the UI
    const rowsTarget = Math.max(1, Number(req.nextUrl.searchParams.get('rows') ?? 500))
    // We'll try to fetch this many per page (up to upstream limits)
    const pageSize = Math.min(rowsTarget, 500) // safe cap

    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    // Candidate upstreams we’ll try
    const upstreamBases: string[] = [
      `${BASE}/talentpool/${encodeURIComponent(params.id)}/user/${encodeURIComponent(params.userId)}/candidates`,
      `${BASE}/talentpools/${encodeURIComponent(params.id)}/user/${encodeURIComponent(params.userId)}/candidates`,
      `${BASE}/talentpool/${encodeURIComponent(params.id)}/candidates`,
      `${BASE}/talentpools/${encodeURIComponent(params.id)}/candidates`,
    ]

    const headers = new Headers({
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    })

    const doFetch = (url: string) => fetch(url, { method: 'GET', headers, cache: 'no-store' })

    // pagination strategies to probe (first that returns rows will be used)
    const strategies = [
      // page + per_page
      (base: string, page: number, size: number) => qs(base, { page, per_page: size }),
      // page + page_size
      (base: string, page: number, size: number) => qs(base, { page, page_size: size }),
      // page + size
      (base: string, page: number, size: number) => qs(base, { page, size }),
      // start + rows (Solr style)
      (base: string, page: number, size: number) => qs(base, { start: (page - 1) * size, rows: size }),
      // offset + limit
      (base: string, page: number, size: number) => qs(base, { offset: (page - 1) * size, limit: size }),
      // skip + take
      (base: string, page: number, size: number) => qs(base, { skip: (page - 1) * size, take: size }),
      // page only (some APIs ignore size and stick to a tenant default, e.g., 25)
      (base: string, page: number, _size: number) => qs(base, { page }),
      // pageNo only
      (base: string, page: number, _size: number) => qs(base, { pageNo: page }),
      // page_number + page_size
      (base: string, page: number, size: number) => qs(base, { page_number: page, page_size: size }),
    ]

    const tried: Array<{ url: string; status?: number; count?: number }> = []
    const collected: Norm[] = []
    const seenKey = new Set<string>()
    let poolTotal: number | null = null
    let finalUpstreamBase = upstreamBases[0]
    let chosenStrategyIndex = -1

    // helper to add rows with de-dupe
    const addRows = (rows: Norm[]) => {
      for (const r of rows) {
        const key = (r.email || `${r.first_name} ${r.last_name}`).toLowerCase().trim()
        if (key && !seenKey.has(key)) {
          seenKey.add(key)
          collected.push(r)
          if (collected.length >= rowsTarget) break
        }
      }
    }

    // 1) Find a base + strategy that returns anything
    outer: for (const base of upstreamBases) {
      finalUpstreamBase = base
      for (let sIdx = 0; sIdx < strategies.length; sIdx++) {
        const url = strategies[sIdx](base, 1, pageSize)
        let res = await doFetch(url)
        if (res.status === 401 || res.status === 403) {
          const ok = await refreshIdToken(userKey)
          if (!ok) return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
          const fresh = await getSession()
          const newToken = fresh.tokens?.idToken
          if (!newToken) return NextResponse.json({ error: 'No idToken after refresh' }, { status: 401 })
          headers.set('id-token', newToken)
          headers.set('Authorization', `Bearer ${newToken}`)
          res = await doFetch(url)
        }

        // try totals from headers first
        poolTotal = poolTotal ?? parseTotalFromHeaders(res.headers)

        const data = await res.json().catch(() => ({}))
        poolTotal = poolTotal ?? parseTotalFromJson(data)

        const norm = normalizeCandidates(data)
        tried.push({ url, status: res.status, count: norm.length })

        if (norm.length > 0) {
          addRows(norm)
          chosenStrategyIndex = sIdx
          break outer
        }
      }
    }

    // If nothing at all came back, just respond empty
    if (collected.length === 0 && chosenStrategyIndex === -1) {
      return NextResponse.json(
        {
          candidates: [],
          meta: {
            upstream: finalUpstreamBase,
            count: 0,
            total: poolTotal,
            tried,
            rowsRequested: rowsTarget,
            pagesFetched: 0,
          },
        },
        {
          status: 200,
          headers: {
            'x-vincere-base': withApiV2(config.VINCERE_TENANT_API_BASE),
            'x-vincere-userid': params.userId,
            'x-vincere-upstream': finalUpstreamBase,
            'x-vincere-total': poolTotal != null ? String(poolTotal) : '',
            'x-rows': String(rowsTarget),
          },
        }
      )
    }

    // 2) Keep paging with the chosen strategy until we reach rowsTarget or no more rows
    let page = 2
    let pagesFetched = 1
    const maxPages = Math.ceil(rowsTarget / Math.max(1, pageSize)) + 5 // small cushion

    while (collected.length < rowsTarget && page <= maxPages) {
      const pageUrl = strategies[chosenStrategyIndex](finalUpstreamBase, page, pageSize)
      const res = await doFetch(pageUrl)
      // totals again (some APIs only include on first page; we won't overwrite an existing number)
      poolTotal = poolTotal ?? parseTotalFromHeaders(res.headers)

      const data = await res.json().catch(() => ({}))
      poolTotal = poolTotal ?? parseTotalFromJson(data)

      const norm = normalizeCandidates(data)
      tried.push({ url: pageUrl, status: res.status, count: norm.length })

      if (!norm.length) break
      const before = collected.length
      addRows(norm)
      pagesFetched++
      if (collected.length === before) break // no net new (all dupes)
      page++
    }

    return NextResponse.json(
      {
        candidates: collected,
        meta: {
          upstream: finalUpstreamBase,
          count: collected.length,
          total: poolTotal,          // may still be null if upstream never exposes it
          tried,
          rowsRequested: rowsTarget,
        },
      },
      {
        status: 200,
        headers: {
          'x-vincere-base': withApiV2(config.VINCERE_TENANT_API_BASE),
          'x-vincere-userid': params.userId,
          'x-vincere-upstream': finalUpstreamBase,
          'x-vincere-total': poolTotal != null ? String(poolTotal) : '',
          'x-rows': String(rowsTarget),
        },
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

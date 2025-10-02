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

/** HTTP helpers (GET/POST) with auth + no-store */
const http = (headers: Headers) => ({
  get: (url: string) => fetch(url, { method: 'GET', headers, cache: 'no-store' }),
  postJson: (url: string, body: any) =>
    fetch(url, {
      method: 'POST',
      headers: new Headers([...headers.entries(), ['content-type', 'application/json']]),
      cache: 'no-store',
      body: JSON.stringify(body ?? {}),
    }),
  postNoBody: (url: string) =>
    fetch(url, {
      method: 'POST',
      headers,
      cache: 'no-store',
    }),
})

/** Extract candidate IDs from `getCandidates` response */
function pickIds(resp: any): number[] {
  const content = Array.isArray(resp?.content) ? resp.content : []
  const ids: number[] = []
  for (const item of content) {
    if (typeof item === 'number') ids.push(item)
    else if (typeof item === 'string' && /^\d+$/.test(item)) ids.push(Number(item))
    else if (item && typeof item === 'object') {
      const id =
        (typeof item.id === 'number' && item.id) ||
        (typeof item.candidateId === 'number' && item.candidateId) ||
        (typeof item.personId === 'number' && item.personId) ||
        null
      if (typeof id === 'number') ids.push(id)
    }
  }
  return ids
}

/** Pull total elements from getCandidates JSON */
function pickTotalElements(resp: any): number | null {
  const direct =
    (typeof resp?.totalElements === 'number' && resp.totalElements) ||
    (typeof resp?.page?.totalElements === 'number' && resp.page.totalElements) ||
    (typeof resp?.total === 'number' && resp.total) ||
    null
  return typeof direct === 'number' ? direct : null
}

/** Try several shapes of POST to /talentpools/{id}/getCandidates until one works, then reuse it */
async function fetchGetCandidatesPaged(args: {
  base: string
  poolId: string
  headers: Headers
  refresh: () => Promise<boolean>
  rowsTarget: number
  pageSize: number
}) {
  const { base, poolId, headers, refresh, rowsTarget, pageSize } = args
  const req = http(headers)
  const url = `${base}/talentpools/${encodeURIComponent(poolId)}/getCandidates`

  type Strategy = (page0: number, size: number) => Promise<{ ok: boolean; status: number; data: any; used: string }>
  const strategies: Strategy[] = [
    async (page0, size) => {
      const res = await req.postJson(url, { page: page0, size })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, data, used: `${url} (POST JSON {page,size})` }
    },
    async (page0, size) => {
      const res = await req.postJson(url, { pageNumber: page0, pageSize: size })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, data, used: `${url} (POST JSON {pageNumber,pageSize})` }
    },
    async (page0, size) => {
      const res = await req.postJson(url, { pageable: { pageNumber: page0, pageSize: size } })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, data, used: `${url} (POST JSON {pageable})` }
    },
    async (page0, size) => {
      const qs = `${url}?page=${page0}&size=${size}`
      const res = await req.postNoBody(qs)
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, data, used: `${qs} (POST no body)` }
    },
  ]

  const tried: Array<{ url: string; status?: number; count?: number }> = []
  let chosenIdx = -1
  let collectedIds: number[] = []
  let total: number | null = null
  let page0 = 0
  let pagesFetched = 0

  // Find a working strategy on page 0
  for (let i = 0; i < strategies.length; i++) {
    let resp = await strategies[i](0, pageSize)
    if ((resp.status === 401 || resp.status === 403) && (await refresh())) {
      resp = await strategies[i](0, pageSize)
    }
    const ids = pickIds(resp.data)
    tried.push({ url: resp.used, status: resp.status, count: ids.length })
    total = total ?? pickTotalElements(resp.data)

    if (ids.length > 0) {
      chosenIdx = i
      collectedIds.push(...ids)
      pagesFetched++
      break
    }
  }

  if (chosenIdx === -1) {
    return { ids: collectedIds, total, tried, pagesFetched }
  }

  // Page through until we hit rowsTarget or last page
  while (collectedIds.length < rowsTarget) {
    page0++
    let resp = await strategies[chosenIdx](page0, pageSize)
    if ((resp.status === 401 || resp.status === 403) && (await refresh())) {
      resp = await strategies[chosenIdx](page0, pageSize)
    }
    const ids = pickIds(resp.data)
    tried.push({ url: resp.used, status: resp.status, count: ids.length })
    total = total ?? pickTotalElements(resp.data)
    if (ids.length === 0) break
    collectedIds.push(...ids)
    pagesFetched++
    if (resp.data?.last === true) break
  }

  return { ids: collectedIds.slice(0, rowsTarget), total, tried, pagesFetched }
}

/** Resolve candidate IDs -> names/emails using several strategies. */
async function fetchCandidateDetails(args: {
  base: string
  headers: Headers
  refresh: () => Promise<boolean>
  ids: number[]
}) {
  const { base, headers, refresh, ids } = args
  const req = http(headers)
  const fl = encodeURIComponent('first_name,last_name,email')

  const tried: Array<{ url: string; status?: number; count?: number }> = []

  if (ids.length === 0) {
    return { candidates: [] as Norm[], tried }
  }

  // Batch-friendly GET attempts
  const paramKeys = ['ids', 'id', 'candidate_ids']
  for (const key of paramKeys) {
    const url = `${base}/candidate/search?${key}=${encodeURIComponent(ids.join(','))}&fl=${fl}&rows=${ids.length}`
    let res = await req.get(url)
    if ((res.status === 401 || res.status === 403) && (await refresh())) {
      res = await req.get(url)
    }
    const data = await res.json().catch(() => ({}))
    const norm = normalizeCandidates(data)
    tried.push({ url, status: res.status, count: norm.length })
    if (norm.length > 0) return { candidates: norm, tried }
  }

  // POST variants
  const postBodies = [
    { ids },
    { id: ids },
    { candidate_ids: ids },
    { filters: { ids } },
    { query: { ids } },
  ]
  for (const body of postBodies) {
    const url = `${base}/candidate/search`
    let res = await req.postJson(url, { ...body, fl: 'first_name,last_name,email', rows: ids.length })
    if ((res.status === 401 || res.status === 403) && (await refresh())) {
      res = await req.postJson(url, { ...body, fl: 'first_name,last_name,email', rows: ids.length })
    }
    const data = await res.json().catch(() => ({}))
    const norm = normalizeCandidates(data)
    tried.push({ url, status: res.status, count: norm.length })
    if (norm.length > 0) return { candidates: norm, tried }
  }

  // FINAL FALLBACK: per-ID fetch (limit to 200 for preview safety)
  const perIdLimit = Math.min(ids.length, 200)
  const agg: Norm[] = []
  for (let i = 0; i < perIdLimit; i++) {
    const id = ids[i]
    const url = `${base}/candidate/${encodeURIComponent(String(id))}`
    let res = await req.get(url)
    if ((res.status === 401 || res.status === 403) && (await refresh())) {
      res = await req.get(url)
    }
    const data = await res.json().catch(() => ({}))
    const norm = normalizeCandidates(data)
    tried.push({ url, status: res.status, count: norm.length })
    if (norm.length) agg.push(norm[0])
  }

  return { candidates: agg, tried }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const rowsTarget = Math.max(1, Number(req.nextUrl.searchParams.get('rows') ?? 500))
    const pageSize = Math.min(rowsTarget, 500)

    // session/auth
    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)
    const headers = new Headers({
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    })

    const refresh = async () => {
      const ok = await refreshIdToken(userKey)
      if (!ok) return false
      const s2 = await getSession()
      const t2 = s2.tokens?.idToken
      if (!t2) return false
      headers.set('id-token', t2)
      headers.set('Authorization', `Bearer ${t2}`)
      return true
    }

    // 1) Page through POST /talentpools/{id}/getCandidates to get IDs
    const pageRes = await fetchGetCandidatesPaged({
      base: BASE,
      poolId: params.id,
      headers,
      refresh,
      rowsTarget,
      pageSize,
    })
    const tried: Array<{ url: string; status?: number; count?: number }> = [...pageRes.tried]
    const ids = pageRes.ids
    const total = pageRes.total

    // 2) Resolve those IDs to names/emails
    const details = await fetchCandidateDetails({
      base: BASE,
      headers,
      refresh,
      ids,
    })
    const candidates = details.candidates
    tried.push(...details.tried)

    return NextResponse.json(
      {
        candidates,
        meta: {
          upstream: `${BASE}/talentpools/${encodeURIComponent(params.id)}/getCandidates`,
          count: candidates.length,
          total: typeof total === 'number' ? total : null,
          tried,
          rowsRequested: rowsTarget,
        },
      },
      {
        status: 200,
        headers: {
          'x-vincere-base': BASE,
          'x-vincere-userid': params.userId,
          'x-vincere-upstream': `${BASE}/talentpools/${encodeURIComponent(params.id)}/getCandidates`,
          'x-vincere-total': typeof total === 'number' ? String(total) : '',
          'x-rows': String(rowsTarget),
        },
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

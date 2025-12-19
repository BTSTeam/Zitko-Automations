// app/api/vincere/talentpool/[id]/user/[userId]/all/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type VincereSliceResp = {
  slice_index?: number
  num_of_elements?: number
  last?: boolean
  content?: any[]
}

type CandidateOut = { first_name: string; last_name: string; email: string }

function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

function extractEmail(c: any): string {
  return (
    c?.email ??
    c?.email1 ??
    c?.primary_email ??
    c?.candidate_email ??
    c?.contact_email ??
    c?.email_address ??
    c?.emailAddress ??
    c?.contact?.email ??
    c?.person?.email ??
    (Array.isArray(c?.emails) && c.emails[0]?.email) ??
    ''
  )
}

function normalizeRow(r: any): CandidateOut {
  let first = r?.first_name ?? r?.firstname ?? r?.firstName ?? ''
  let last = r?.last_name ?? r?.lastname ?? r?.lastName ?? ''
  if ((!first || !last) && typeof r?.name === 'string') {
    const parts = r.name.trim().split(/\s+/)
    first = first || parts[0] || ''
    last = last || parts.slice(1).join(' ') || ''
  }
  const email = String(extractEmail(r) || '').trim()
  return { first_name: String(first || '').trim(), last_name: String(last || '').trim(), email }
}

// one retry on 401/403
async function fetchWithRefresh(userKey: string, url: string, init: RequestInit) {
  let session = await getSession()
  let idToken = session.tokens?.idToken

  const doFetch = (token: string | undefined) =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'id-token': token || '',
        'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
        accept: 'application/json',
        Authorization: `Bearer ${token || ''}`,
        ...(init.headers || {}),
      },
      cache: 'no-store',
    })

  let res = await doFetch(idToken)
  if (res.status === 401 || res.status === 403) {
    const ok = await refreshIdToken(userKey)
    if (!ok) return res
    session = await getSession()
    idToken = session.tokens?.idToken
    res = await doFetch(idToken)
  }
  return res
}

export async function GET(
  req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const { id: poolId, userId } = params
    if (!poolId || !userId) {
      return NextResponse.json({ error: 'Missing poolId or userId' }, { status: 400 })
    }

    const session = await getSession()
    const userKey = session.user?.email ?? 'unknown'
    const idToken = session.tokens?.idToken
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    // OPTIONAL: allow a safety cap (defaults high)
    const { searchParams } = new URL(req.url)
    const maxRaw = searchParams.get('max') ?? '200000'
    const max = Math.max(1, Math.min(200000, Number(maxRaw) || 200000))

    const all: CandidateOut[] = []
    let sliceIndex = 0
    let last = false
    let pagesFetched = 0

    // Derived totals (based on what we actually retrieved)
    let seen = 0
    let skippedNoEmail = 0
    let duplicates = 0

    // IMPORTANT: dedupe by email so that your “Retrieved X” == what can be sent to AC
    // (AC requires email anyway)
    const emailSeen = new Set<string>()

    // hard safety cap
    const SLICE_CAP = 5000

    while (!last && sliceIndex < SLICE_CAP && all.length < max) {
      const url = `${BASE}/talentpool/${encodeURIComponent(poolId)}/user/${encodeURIComponent(
        userId
      )}/candidates?index=${sliceIndex}`

      const res = await fetchWithRefresh(userKey, url, { method: 'GET' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (sliceIndex === 0) {
          return NextResponse.json(
            { error: `Vincere slice fetch failed (${res.status})`, details: body },
            { status: res.status }
          )
        }
        break
      }

      const slice = (await res.json().catch(() => ({}))) as VincereSliceResp
      const arr = Array.isArray(slice?.content) ? slice.content : []
      last = !!slice?.last
      pagesFetched++

      for (const raw of arr) {
        seen++
        const row = normalizeRow(raw)
        if (!row.email || !/\S+@\S+\.\S+/.test(row.email)) {
          skippedNoEmail++
          continue
        }
        const key = row.email.toLowerCase()
        if (emailSeen.has(key)) {
          duplicates++
          continue
        }
        emailSeen.add(key)
        all.push(row)
        if (all.length >= max) break
      }

      sliceIndex++
    }

    const totals = {
      seen,
      valid: all.length,              // uploadable + unique emails
      sent: 0,                        // (sending happens later)
      skippedNoEmail,
      duplicates,
      pagesFetched,
      poolTotal: all.length,          // keep same name as UI expects
    }

    return NextResponse.json({ candidates: all, totals }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

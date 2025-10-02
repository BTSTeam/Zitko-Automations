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

type NormalizedCandidate = { first_name: string; last_name: string; email: string }

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

function normalizeCandidates(data: any): NormalizedCandidate[] {
  const arr =
    (Array.isArray(data?.candidates) && data.candidates) ||
    (Array.isArray(data?.docs) && data.docs) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.results) && data.results) ||
    (Array.isArray(data) ? data : [])

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
    .filter((c: NormalizedCandidate) => c.email)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email ?? 'unknown'
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    // 🔎 Build and expose the exact upstream Vincere URL
    const upstreamUrl =
      `${BASE}/talentpool/${encodeURIComponent(params.id)}` +
      `/user/${encodeURIComponent(params.userId)}/candidates`

    const headers = new Headers({
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    })

    const doFetch = () => fetch(upstreamUrl, { method: 'GET', headers, cache: 'no-store' })

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
    const candidates = normalizeCandidates(data)

    return NextResponse.json(
      { candidates, meta: { upstream: upstreamUrl, count: candidates.length } },
      {
        status: 200,
        headers: {
          'x-vincere-base': BASE,
          'x-vincere-userid': params.userId,
          'x-vincere-upstream': upstreamUrl, // 👈 visible in DevTools → Headers
        },
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

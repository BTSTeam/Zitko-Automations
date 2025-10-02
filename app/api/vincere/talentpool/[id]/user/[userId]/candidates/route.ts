export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

// Ensure base ends with /api/v2
function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

// ---------- Unwrap helpers ----------
function unwrapToArray(json: any): any[] {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.items)) return json.items
  if (Array.isArray(json?.data?.items)) return json.data.items
  if (Array.isArray(json?.data)) return json.data
  if (Array.isArray(json?.results)) return json.results
  if (Array.isArray(json?.docs)) return json.docs
  if (Array.isArray(json?.candidates)) return json.candidates
  return []
}

// ---------- Normalization ----------
type NormalizedCandidate = { id: string | number; first_name: string; last_name: string; email: string | null }

function extractEmail(c: any): string | null {
  return (
    c?.email ??
    c?.work_email ??
    c?.email1 ??
    c?.primary_email ??
    c?.candidate_email ??
    c?.contact_email ??
    c?.emailAddress ??
    c?.contact?.email ??
    c?.person?.email ??
    c?.candidate?.email ??
    c?.candidate?.work_email ??
    (Array.isArray(c?.emails) && c.emails[0]?.email) ??
    (Array.isArray(c?.candidate?.emails) && c.candidate.emails[0]?.email) ??
    null
  )
}

function normalizeCandidate(r: any): NormalizedCandidate {
  const id =
    r.candidate_id ??
    r.id ??
    r.candidateId ??
    r?.candidate?.id ??
    `${r.first_name ?? r.firstName ?? 'unknown'}-${r.last_name ?? r.lastName ?? 'unknown'}`

  // Names may be at root or nested in candidate
  let first = r.first_name ?? r.firstName ?? r?.candidate?.first_name ?? r?.candidate?.firstName ?? ''
  let last  = r.last_name  ?? r.lastName  ?? r?.candidate?.last_name  ?? r?.candidate?.lastName  ?? ''

  if ((!first || !last) && typeof r.name === 'string') {
    const parts = r.name.trim().split(/\s+/)
    first = first || parts[0] || ''
    last  = last  || parts.slice(1).join(' ') || ''
  }

  const email = extractEmail(r)

  return {
    id,
    first_name: String(first || '').trim(),
    last_name: String(last || '').trim(),
    email: email ? String(email).trim() : null,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    // --- Session & token (mirror your other working routes) ---
    let session = await getSession()
    let idToken = session?.vincere?.id_token
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere' }, { status: 401 })
    }

    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)
    const upstreamUrl =
      `${BASE}/talentpool/${encodeURIComponent(params.id)}` +
      `/user/${encodeURIComponent(params.userId)}/candidates`

    const headers = new Headers({
      accept: 'application/json',
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      // Some tenants accept Bearer, some ignore it—harmless to include:
      Authorization: `Bearer ${idToken}`,
    })

    const doFetch = () => fetch(upstreamUrl, { method: 'GET', headers, cache: 'no-store' })

    // First attempt
    let res = await doFetch()

    // Refresh on auth failure (mirror pattern from your other routes)
    if (res.status === 401 || res.status === 403) {
      const refreshed = await refreshIdToken(session)
      if (!refreshed) {
        return NextResponse.json({ error: 'Auth refresh failed' }, { status: 401 })
      }
      // Re-read session after refresh
      session = await getSession()
      idToken = session?.vincere?.id_token
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
    const unwrapped = unwrapToArray(raw)
    const candidates = unwrapped
      .filter((x: any) => x && typeof x === 'object')
      .map(normalizeCandidate)

    // NOTE: do NOT filter by email here; let the UI decide
    return NextResponse.json(
      { items: candidates, meta: { upstream: upstreamUrl, count: candidates.length } },
      {
        status: 200,
        headers: {
          'x-vincere-base': BASE,
          'x-vincere-userid': params.userId,
          'x-vincere-upstream': upstreamUrl,
        },
      }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

// app/api/sourcing/addCandidate/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type InCandidate = any

type Body = {
  candidates: InCandidate[]
  industryTag: string
  note?: string
}

type OutRow =
  | { ok: true; index: number; id?: string; message?: string }
  | { ok: false; index: number; error: string; status?: number; detail?: string }

function s(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Split a full name into first/last for Vincere payload */
function splitName(fullName: string): { first_name?: string; last_name?: string } {
  const n = (fullName || '').trim().replace(/\s+/g, ' ')
  if (!n) return {}
  const parts = n.split(' ')
  if (parts.length === 1) return { first_name: parts[0] }
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts.slice(-1)[0] }
}

/**
 * Map an Apollo person object to a Vincere candidate payload.
 * NOTE: Field names follow common Vincere v2 shapes; adjust if your tenant expects
 * different property names. We include only safe/common fields and the required Source.
 */
function mapToVincereCandidate(input: InCandidate, industryTag: string, note?: string) {
  const name =
    s(input.name) ||
    [s(input.first_name), s(input.last_name)].filter(Boolean).join(' ').trim()

  const { first_name, last_name } = splitName(name)

  const email = s(input.email)
  const linkedin_url = s(input.linkedin_url) || s(input.linkedinUrl)
  const current_job_title =
    s(input.title) || s(input.current_title) || s(input.headline)
  const organization_name =
    s(input.organization_name) || s(input.organization?.name)
  const location =
    s(input.present_raw_address) ||
    s(input.current_location_name) ||
    s(input.location)

  // Minimal, commonly-accepted candidate fields
  const payload: Record<string, any> = {
    first_name,
    last_name,
    email: email || undefined,
    linkedin_url: linkedin_url || undefined,
    current_job_title: current_job_title || undefined,
    current_company_name: organization_name || undefined,
    current_location_name: location || undefined,

    // REQUIRED BY SPEC: set Source
    source: 'BTS - Candidate Sourcing Tool',

    // Industry: your /industries route returns names; many Vincere tenants accept either
    // an id or name depending on setup. We send a name field that is commonly mapped.
    industry_name: industryTag || undefined,

    // Optional note/comment
    note: note || undefined,
    comment: note || undefined,
    description: note || undefined,
  }

  // Strip empty keys (undefined/null/'')
  for (const k of Object.keys(payload)) {
    const v = payload[k]
    if (v == null) delete payload[k]
    else if (typeof v === 'string' && v.trim() === '') delete payload[k]
  }

  return payload
}

/* ----------------------------- Vincere auth ----------------------------- */

async function ensureVincereToken(): Promise<string | null> {
  try {
    // Requires VINCERE_* & REDIRECT_URI – enforced in lib/config.ts
    requiredEnv()
  } catch (e) {
    console.error('Missing Vincere env vars', e)
    return null
  }

  const session = await getSession()
  if (session?.tokens?.idToken) return session.tokens.idToken

  // Attempt refresh (your user key may differ)
  const ok = await refreshIdToken('default')
  if (!ok) return null

  const session2 = await getSession()
  return session2?.tokens?.idToken ?? null
}

/* -------------------------------- Route --------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const { candidates, industryTag, note } = (await req.json()) as Body

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json(
        { error: 'No candidates provided.' },
        { status: 400 },
      )
    }

    if (!industryTag || typeof industryTag !== 'string') {
      return NextResponse.json(
        { error: 'industryTag is required (string).' },
        { status: 400 },
      )
    }

    const idToken = await ensureVincereToken()
    if (!idToken) {
      return NextResponse.json(
        { error: 'Unable to obtain Vincere token. Ensure OAuth is connected.' },
        { status: 401 },
      )
    }

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const url = `${base}/api/v2/candidate`

    // Process sequentially or with small concurrency to be gentle on API
    const CONCURRENCY = 3
    let cursor = 0
    const results: OutRow[] = []

    async function worker() {
      while (cursor < candidates.length) {
        const i = cursor++
        const c = candidates[i]
        try {
          const payload = mapToVincereCandidate(c, industryTag, note)
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.VINCERE_API_KEY!,
              Authorization: `Bearer ${idToken}`,
              'Cache-Control': 'no-store',
            },
            body: JSON.stringify(payload),
          })

          const text = await res.text().catch(() => '')
          let json: any = null
          try {
            json = text ? JSON.parse(text) : null
          } catch {
            // non-JSON payloads are possible on errors
          }

          if (!res.ok) {
            results.push({
              ok: false,
              index: i,
              status: res.status,
              error: `Vincere create failed (${res.status})`,
              detail: json?.error || text || 'Unknown error',
            })
            continue
          }

          // Most tenants return the created id in body; capture if present
          const createdId =
            json?.id ||
            json?.candidate_id ||
            json?.data?.id ||
            json?.data?.candidate_id

          results.push({
            ok: true,
            index: i,
            id: createdId ? String(createdId) : undefined,
            message: 'Created',
          })
        } catch (e: any) {
          results.push({
            ok: false,
            index: i,
            error: e?.message || 'Unexpected error',
          })
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()))

    const okCount = results.filter((r) => r.ok).length
    const errCount = results.length - okCount

    return NextResponse.json(
      {
        ok: okCount,
        errors: errCount,
        results,
      },
      { status: 200 },
    )
  } catch (e: any) {
    console.error('addCandidate route error', e)
    return NextResponse.json(
      { error: e?.message || 'Unknown server error' },
      { status: 500 },
    )
  }
}

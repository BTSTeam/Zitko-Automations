// app/api/sourcing/addCompany/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type InCompany = any

type Body = {
  companies: InCompany[]
  industryTag: string
  note?: string
}

type OutRow =
  | { ok: true; index: number; id?: string; message?: string }
  | { ok: false; index: number; error: string; status?: number; detail?: string }

function s(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Map an Apollo organization object to a Vincere company payload.
 * NOTE: Field names follow common Vincere v2 shapes; adjust to your tenant if needed.
 */
function mapToVincereCompany(input: InCompany, industryTag: string, note?: string) {
  const name = s(input.name)
  const domain = s(input.domain || input.primary_domain)
  const website = s(input.website_url) || (domain ? `https://${domain}` : '')
  const linkedin_url = s(input.linkedin_url) || s(input.linkedinUrl)
  const location = s(input.location || input.headquarters_address)

  // Minimal, commonly-accepted company fields
  const payload: Record<string, any> = {
    name: name || undefined,
    website: website || undefined,
    linkedin_url: linkedin_url || undefined,

    // Location fields vary per tenant; provide a generic text field
    primary_address: location || undefined,

    // Industry: many tenants accept either id or name depending on mappings
    industry_name: industryTag || undefined,

    // Optional note/comment (put in multiple common fields for compatibility)
    note: note || undefined,
    description: note || undefined,
    comment: note || undefined,
  }

  // Strip empty keys
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
    requiredEnv() // enforces VINCERE_* and REDIRECT_URI
  } catch (e) {
    console.error('Missing Vincere env vars', e)
    return null
  }

  const session = await getSession()
  if (session?.tokens?.idToken) return session.tokens.idToken

  const ok = await refreshIdToken('default') // adjust user key if you use per-user tokens
  if (!ok) return null

  const session2 = await getSession()
  return session2?.tokens?.idToken ?? null
}

/* -------------------------------- Route --------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const { companies, industryTag, note } = (await req.json()) as Body

    if (!Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json(
        { error: 'No companies provided.' },
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
    const url = `${base}/api/v2/company`

    // Use small concurrency to be gentle on the API
    const CONCURRENCY = 3
    let cursor = 0
    const results: OutRow[] = []

    async function worker() {
      while (cursor < companies.length) {
        const i = cursor++
        const c = companies[i]
        try {
          const payload = mapToVincereCompany(c, industryTag, note)

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
            // ignore non-JSON responses
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

          // Capture created id if returned
          const createdId =
            json?.id ||
            json?.company_id ||
            json?.data?.id ||
            json?.data?.company_id

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

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, companies.length) }, () => worker()),
    )

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
    console.error('addCompany route error', e)
    return NextResponse.json(
      { error: e?.message || 'Unknown server error' },
      { status: 500 },
    )
  }
}

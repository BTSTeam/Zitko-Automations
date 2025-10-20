// app/api/sourcing/addCandidate/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type PostBody = {
  // minimal
  name?: string
  first_name?: string
  last_name?: string
  linkedin_url?: string

  // recommended
  email?: string
  phone?: string
  title?: string
  organization_name?: string
  location?: string

  // optional
  notes?: string
  industries?: Array<number | string> // Vincere industry IDs
}

/* ----------------------------- helpers ----------------------------- */

function splitNameFallback(name?: string): { first_name?: string; last_name?: string } {
  const t = String(name ?? '').trim()
  if (!t) return {}
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { first_name: parts[0] }
  const first_name = parts.slice(0, -1).join(' ')
  const last_name = parts.at(-1)
  return { first_name, last_name }
}

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

/* ------------------------------ route ------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody

    // Resolve name fields
    let { first_name, last_name } = body
    if (!first_name && !last_name) {
      const split = splitNameFallback(body.name)
      first_name = first_name || split.first_name
      last_name = last_name || split.last_name
    }

    if (!first_name && !last_name) {
      return NextResponse.json(
        { error: 'first_name/last_name or name is required' },
        { status: 400 },
      )
    }

    // Require LinkedIn URL for your dedupe rules to be meaningful
    if (!body.linkedin_url) {
      return NextResponse.json(
        { error: 'linkedin_url is required' },
        { status: 400 },
      )
    }

    const idToken = await ensureVincereToken()
    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing Vincere credentials (env or token)' },
        { status: 500 },
      )
    }

    // Build Vincere payload
    // NOTE: Field names reflect common Vincere v2 patterns; adjust if your tenant differs.
    // - Source is set as a simple string field. If your tenant uses a source_id enum,
    //   you can map/lookup and send candidate_source_id instead.
    const payload: Record<string, any> = {
      first_name,
      last_name,
      linkedin_url: body.linkedin_url,
      source: 'BTS - Candidate Sourcing Tool', // ✅ required by your spec
    }

    if (body.email) {
      // Vincere commonly supports a flat email field or an emails collection depending on endpoint.
      // Keep both variants for compatibility; the API will ignore unknown fields.
      payload.email = body.email
      payload.emails = [
        { address: body.email, type: 'work', is_default: true },
      ]
    }

    if (body.phone) {
      payload.phone = body.phone
      payload.phones = [
        { number: body.phone, type: 'mobile', is_default: true },
      ]
    }

    if (body.title) payload.title = body.title
    if (body.organization_name) {
      // Optionally seed current company into summary; some tenants support current_employer/company fields
      payload.current_company = body.organization_name
    }
    if (body.location) payload.location = body.location
    if (body.notes) payload.description = body.notes

    // Industries (array of IDs). Many Vincere tenants accept `industries: [{ id }]` at create.
    const ind = (body.industries ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n))
    if (ind.length) {
      payload.industries = ind.map((id) => ({ id }))
    }

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const url = `${base}/api/v2/candidate`

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

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Vincere candidate create error ${res.status}: ${text}` },
        { status: 502 },
      )
    }

    const json = (await res.json()) as any
    // Commonly returns { id, ... } or { data: { id, ... } }
    const createdId =
      (json && (json.id || json._id)) ??
      (json?.data && (json.data.id || json.data._id)) ??
      null

    return NextResponse.json(
      {
        ok: true,
        id: createdId,
        echo: {
          first_name,
          last_name,
          linkedin_url: body.linkedin_url,
          email: body.email,
          phone: body.phone,
          title: body.title,
          organization_name: body.organization_name,
          location: body.location,
          industries: ind,
          source: 'BTS - Candidate Sourcing Tool',
        },
      },
      { status: 200 },
    )
  } catch (e: any) {
    console.error('addCandidate error', e)
    return NextResponse.json({ error: e?.message || 'Unknown server error' }, { status: 500 })
  }
}

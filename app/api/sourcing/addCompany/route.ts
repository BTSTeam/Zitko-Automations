// app/api/sourcing/addCompany/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type PostBody = {
  // required
  name?: string

  // optional
  website?: string
  linkedin_url?: string
  domain?: string
  phone?: string
  notes?: string

  // address (all optional)
  address_line1?: string
  city?: string
  state?: string
  country?: string
  postcode?: string

  // Vincere industry IDs
  industries?: Array<number | string>

  // Upsert behavior (default true): check for existing by name/domain
  upsert?: boolean
}

/* ----------------------------- helpers ----------------------------- */

function parseDomain(input?: string): string | undefined {
  const s = (input ?? '').trim()
  if (!s) return undefined
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    const host = u.hostname.toLowerCase()
    // strip leading www.
    return host.replace(/^www\./, '')
  } catch {
    // Not a URL; treat as a plain domain string and sanitize
    return s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase()
  }
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

/** Search Vincere company by name or domain; returns first match id if found */
async function findExistingCompany(args: {
  idToken: string
  name?: string
  domain?: string
}): Promise<string | null> {
  const { idToken } = args
  const name = (args.name ?? '').trim()
  const domain = (args.domain ?? '').trim().toLowerCase()

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const url = new URL(`${base}/api/v2/company/search/fl=id,name,website,domain`)
  // Build a conservative OR query: name OR domain
  const clauses: string[] = []
  if (name) clauses.push(`name:"${name.replace(/"/g, '\\"')}"`)
  if (domain) clauses.push(`domain:"${domain.replace(/"/g, '\\"')}"`)
  if (!clauses.length) return null

  url.searchParams.set('q', `${clauses.join(' OR ')}#`)
  url.searchParams.set('page', '1')
  url.searchParams.set('size', '1')

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
    console.error('Vincere company search error', res.status, await res.text().catch(() => ''))
    return null
  }

  const j = (await res.json()) as any
  const items = Array.isArray(j?.items) ? j.items : []
  return items[0]?.id ?? null
}

/* ------------------------------ route ------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody

    // Validate required
    const name = String(body.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }

    const idToken = await ensureVincereToken()
    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing Vincere credentials (env or token)' },
        { status: 500 },
      )
    }

    // Normalize website/domain
    const website = (body.website ?? '').trim()
    const domain = (body.domain ?? parseDomain(website))?.toLowerCase()

    // Upsert: check existing by name/domain unless explicitly disabled
    const doUpsert = body.upsert !== false
    if (doUpsert) {
      const existingId = await findExistingCompany({ idToken, name, domain })
      if (existingId) {
        return NextResponse.json(
          {
            ok: true,
            id: existingId,
            upserted: true,
            existing: true,
            echo: { name, website, domain },
          },
          { status: 200 },
        )
      }
    }

    // Build payload for Vincere company creation
    // Note: Field names are common v2 patterns; tenant schemas can vary.
    const payload: Record<string, any> = {
      name,
    }

    if (website) payload.website = website
    if (domain) payload.domain = domain
    if (body.linkedin_url) payload.linkedin_url = body.linkedin_url

    if (body.phone) {
      payload.phone = body.phone
      payload.phones = [{ number: body.phone, type: 'main', is_default: true }]
    }

    // Address (basic)
    const addrLine1 = (body.address_line1 ?? '').trim()
    const city = (body.city ?? '').trim()
    const state = (body.state ?? '').trim()
    const country = (body.country ?? '').trim()
    const postcode = (body.postcode ?? '').trim()
    if (addrLine1 || city || state || country || postcode) {
      payload.addresses = [
        {
          line1: addrLine1 || undefined,
          city: city || undefined,
          state: state || undefined,
          country: country || undefined,
          post_code: postcode || undefined,
          type: 'headquarters',
          is_default: true,
        },
      ]
    }

    if (body.notes) payload.description = body.notes

    const industries = (body.industries ?? [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n))
    if (industries.length) {
      payload.industries = industries.map((id) => ({ id }))
    }

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const createUrl = `${base}/api/v2/company`

    const res = await fetch(createUrl, {
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
        { error: `Vincere company create error ${res.status}: ${text}` },
        { status: 502 },
      )
    }

    const json = (await res.json()) as any
    const createdId =
      (json && (json.id || json._id)) ??
      (json?.data && (json.data.id || json.data._id)) ??
      null

    return NextResponse.json(
      {
        ok: true,
        id: createdId,
        upserted: false,
        existing: false,
        echo: {
          name,
          website: website || undefined,
          domain: domain || undefined,
          linkedin_url: body.linkedin_url || undefined,
          phone: body.phone || undefined,
          address: { line1: addrLine1 || undefined, city: city || undefined, state: state || undefined, country: country || undefined, postcode: postcode || undefined },
          industries,
        },
      },
      { status: 200 },
    )
  } catch (e: any) {
    console.error('addCompany error', e)
    return NextResponse.json({ error: e?.message || 'Unknown server error' }, { status: 500 })
  }
}

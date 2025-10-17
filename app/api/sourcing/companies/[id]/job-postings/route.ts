// app/api/sourcing/companies/[id]/job-postings/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

function s(v: unknown) {
  return typeof v === 'string' ? v : ''
}
function capInt(n: unknown, min = 1, max = 100, def = 50) {
  const x = Math.floor(Number(n))
  if (Number.isFinite(x)) return Math.max(min, Math.min(max, x))
  return def
}

export async function GET(
  req: NextRequest,
  ctx: { params: { id?: string } }
) {
  try {
    const id = s(ctx?.params?.id).trim()
    if (!id) {
      return NextResponse.json({ error: 'Missing organization id' }, { status: 400 })
    }

    const apiKey = s(process.env.APOLLO_API_KEY)
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing APOLLO_API_KEY' }, { status: 500 })
    }

    const url = new URL(`https://api.apollo.io/api/v1/organizations/${encodeURIComponent(id)}/job_postings`)
    const { searchParams } = new URL(req.url)

    const page = capInt(searchParams.get('page'), 1, 500, 1)         // Apollo supports up to 500 pages in many search endpoints
    const perPage = capInt(searchParams.get('per_page'), 1, 100, 50) // keep default 50 like the rest of your tool

    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(perPage))

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })

    const text = await resp.text().catch(() => '')
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch {}

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Apollo job postings ${resp.status}`, detail: json || text },
        { status: 502 }
      )
    }

    // Pass-through
    return NextResponse.json(json ?? {}, { status: 200 })
  } catch (e: any) {
    console.error('job postings route error', e)
    return NextResponse.json({ error: e?.message || 'Unknown server error' }, { status: 500 })
  }
}

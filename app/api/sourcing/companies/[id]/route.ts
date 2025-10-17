// app/api/sourcing/companies/[id]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

function s(v: unknown) {
  return typeof v === 'string' ? v : ''
}

export async function GET(
  _req: NextRequest,
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

    const url = `https://api.apollo.io/api/v1/organizations/${encodeURIComponent(id)}`

    const resp = await fetch(url, {
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
      // Apollo returns 403 if key is not a master key
      return NextResponse.json(
        { error: `Apollo organization info ${resp.status}`, detail: json || text },
        { status: resp.status === 403 ? 403 : 502 }
      )
    }

    // Pass-through of Apollo payload; you can normalize here if needed
    return NextResponse.json(json ?? {}, { status: 200 })
  } catch (e: any) {
    console.error('company info route error', e)
    return NextResponse.json({ error: e?.message || 'Unknown server error' }, { status: 500 })
  }
}

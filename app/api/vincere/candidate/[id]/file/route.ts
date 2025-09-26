// app/api/vincere/candidate/[id]/file/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config } from '@/lib/config'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const candidateId = (params?.id || '').trim()
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: 'Missing candidate id' }, { status: 400 })
    }

    const payload = await req.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const session = await getSession()
    const idToken = session.tokens?.idToken
    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'Not connected to Vincere' }, { status: 401 })
    }

    // --- Hardened base/url construction: always ensure /api/v2 is present ---
    const rawBase = (config.VINCERE_TENANT_API_BASE || '').trim()
    if (!rawBase) {
      return NextResponse.json({ ok: false, error: 'VINCERE_TENANT_API_BASE not configured' }, { status: 500 })
    }
    let base = rawBase.replace(/\/+$/, '') // strip trailing slashes
    if (!/\/api\/v2$/i.test(base)) {
      console.warn('[VINCERE] base missing /api/v2; auto-appending.', { rawBase })
      base = base + '/api/v2'
    }
    const url = `${base}/candidate/${encodeURIComponent(candidateId)}/file`
    // ----------------------------------------------------------------------

    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
    }

    const vinRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const text = await vinRes.text().catch(() => '')
    let body: any = null
    try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }

    // Diagnostics (visible in Vercel Functions logs)
    console.log('[VINCERE CV FILE]', {
      url,
      status: vinRes.status,
      base_used: base,
      rawBase_env: rawBase,
      payload: {
        file_name: payload?.file_name,
        document_type_id: payload?.document_type_id,
        has_url: !!payload?.url,
        has_base64: !!payload?.base_64_content,
      },
    })

    if (!vinRes.ok) {
      return NextResponse.json(
        { ok: false, status: vinRes.status, error: body?.error || body || text },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, status: vinRes.status, data: body })
  } catch (err: any) {
    console.error('[VINCERE CV FILE] fatal:', err?.message || err)
    return NextResponse.json({ ok: false, error: err?.message || 'Proxy failed' }, { status: 500 })
  }
}

// app/api/vincere/candidate/[id]/file/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh' // ⬅️ add

type Params = { params: { id: string } }

// Helper to do the POST once (so we can retry on 401)
async function postToVincere(url: string, idToken: string, payload: any) {
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    'id-token': idToken,
    'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
  }
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
}

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
    let idToken = session.tokens?.idToken || ''

    // Build base URL (ensure /api/v2)
    const rawBase = (config.VINCERE_TENANT_API_BASE || '').trim()
    if (!rawBase) {
      return NextResponse.json({ ok: false, error: 'VINCERE_TENANT_API_BASE not configured' }, { status: 500 })
    }
    let base = rawBase.replace(/\/+$/, '')
    if (!/\/api\/v2$/i.test(base)) base = base + '/api/v2'
    const url = `${base}/candidate/${encodeURIComponent(candidateId)}/file`

    // ---- attempt #1
    let vinRes = await postToVincere(url, idToken, payload)

    // If token has expired, refresh & retry once
    if (vinRes.status === 401) {
      const text = await vinRes.text().catch(() => '')
      const looksExpired =
        /token has expired/i.test(text) || /incoming token has expired/i.test(text) || /unauthorized/i.test(text)

      // derive a stable user key for your refresh store (align with your tokenStore usage)
      const userKey =
        (session.user && (session.user.id || session.user.email || session.user.sub)) ||
        'default-user'

      if (looksExpired) {
        const refreshed = await refreshIdToken(String(userKey))
        if (refreshed) {
          // reload updated idToken from session (refreshIdToken writes into session)
          const postRefreshSession = await getSession()
          idToken = postRefreshSession.tokens?.idToken || ''
          if (!idToken) {
            return NextResponse.json({ ok: false, error: 'Failed to load refreshed id token' }, { status: 401 })
          }
          // attempt #2
          vinRes = await postToVincere(url, idToken, payload)
        }
      }
      // if still 401 after refresh (or refresh failed) we'll fall through and return error payload below
      // (client can prompt re-connect)
    }

    const text = await vinRes.text().catch(() => '')
    let body: any = null
    try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }

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
        { status: vinRes.status === 401 ? 401 : 400 }
      )
    }

    return NextResponse.json({ ok: true, status: vinRes.status, data: body })
  } catch (err: any) {
    console.error('[VINCERE CV FILE] fatal:', err?.message || err)
    return NextResponse.json({ ok: false, error: err?.message || 'Proxy failed' }, { status: 500 })
  }
}

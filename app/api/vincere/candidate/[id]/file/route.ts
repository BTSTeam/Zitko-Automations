// app/api/vincere/candidate/[id]/file/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

type Params = { params: { id: string } }

function ensurePdfName(name: string): string {
  if (!name) return 'document.pdf'
  return name.toLowerCase().endsWith('.pdf')
    ? name
    : name.replace(/\.[^.]+$/, '') + '.pdf'
}

// Keep payload shape flexible but enforce exclusivity + required fields.
function validateSalesPayload(input: any) {
  const file_name = ensurePdfName(String(input?.file_name || 'document.pdf'))
  const document_type_id = Number(input?.document_type_id ?? 1)

  const has_base64 = !!input?.has_base64
  const has_url = !!input?.has_url

  if (has_base64 === has_url) {
    // Either both true/false: not allowed
    return { ok: false, error: 'Provide exactly one of has_base64 or has_url.' as const }
  }

  if (has_base64) {
    const base64 = input?.base64 || input?.base_64_content
    if (!base64 || typeof base64 !== 'string') {
      return { ok: false, error: 'Missing base64 string for has_base64=true.' as const }
    }
    // Pass through as-is to Vincere (you’ve had 200s with this shape).
    return {
      ok: true,
      outbound: {
        file_name,
        document_type_id,
        has_base64: true,
        base64, // keep your client’s field name if it’s already working
      },
      meta: { mode: 'base64' as const }
    }
  }

  // URL mode
  const url = input?.url || input?.file_url
  if (!url || typeof url !== 'string') {
    return { ok: false, error: 'Missing url string for has_url=true.' as const }
  }
  return {
    ok: true,
    outbound: {
      file_name,
      document_type_id,
      has_url: true,
      url, // keep as url if your tenant expects this (works in your logs)
    },
    meta: { mode: 'url' as const }
  }
}

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

    const incoming = await req.json().catch(() => null)
    if (!incoming || typeof incoming !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    // Validate / normalize client payload
    const check = validateSalesPayload(incoming)
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 400 })
    }
    const outbound = check.outbound
    const mode = check.meta.mode

    // Session + token
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
    let vinRes = await postToVincere(url, idToken, outbound)

    // If token has expired, refresh & retry once
    if (vinRes.status === 401) {
      const text = await vinRes.clone().text().catch(() => '')
      const looksExpired =
        /token has expired/i.test(text) ||
        /incoming token has expired/i.test(text) ||
        /unauthorized/i.test(text)

      const userKey =
        (session as any)?.user?.email ??
        (session as any)?.userEmail ??
        (session as any)?.user_id ??
        'default-user'

      if (looksExpired) {
        const refreshed = await refreshIdToken(String(userKey))
        if (refreshed) {
          const postRefreshSession = await getSession()
          idToken = postRefreshSession.tokens?.idToken || ''
          if (!idToken) {
            return NextResponse.json({ ok: false, error: 'Failed to load refreshed id token' }, { status: 401 })
          }
          // attempt #2
          vinRes = await postToVincere(url, idToken, outbound)
          if (vinRes.status === 401) {
            return NextResponse.json({ ok: false, error: 'Unauthorized after token refresh' }, { status: 401 })
          }
        } else {
          return NextResponse.json({ ok: false, error: 'Session expired. Please re-connect to Vincere.' }, { status: 401 })
        }
      }
    }

    const text = await vinRes.text().catch(() => '')
    let body: any = null
    try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }

    // Structured server log (no sensitive data)
    console.log('[VINCERE CV FILE]', {
      url,
      status: vinRes.status,
      base_used: base,
      rawBase_env: rawBase,
      payload_info: {
        file_name: outbound?.file_name,
        document_type_id: outbound?.document_type_id,
        mode, // 'base64' or 'url'
        has_url: !!(outbound as any)?.url,
        has_base64: !!(outbound as any)?.base64 || !!(outbound as any)?.base_64_content,
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

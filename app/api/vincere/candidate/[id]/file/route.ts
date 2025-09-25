export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')

async function doVincerePost(url: string, idToken: string, body: unknown) {
  const headers = new Headers()
  headers.set('id-token', idToken)
  headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY)
  headers.set('accept', 'application/json')
  headers.set('content-type', 'application/json')
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    const refreshed = await refreshIdToken(session)
    const idToken = (refreshed as any)?.idToken ?? (session as any)?.idToken
    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'Not connected to Vincere' }, { status: 401 })
    }

    const id = params.id
    const payload = await req.json()

    if (!payload?.file_name) return NextResponse.json({ ok: false, error: 'file_name is required' }, { status: 400 })
    if (!payload?.url && !payload?.base_64_content) {
      return NextResponse.json({ ok: false, error: 'Provide url or base_64_content' }, { status: 400 })
    }

    const url = `${BASE}/candidate/${encodeURIComponent(id)}/file`

    let res = await doVincerePost(url, idToken, payload)

    if (res.status === 401) {
      const retry = await refreshIdToken(session)
      const newToken = (retry as any)?.idToken ?? (session as any)?.idToken
      if (!newToken) return NextResponse.json({ ok: false, error: 'Unable to refresh Vincere session' }, { status: 401 })
      res = await doVincerePost(url, newToken, payload)
    }

    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, error: text || 'Upload failed' }, { status: res.status })
    }

    let data: any
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

    return NextResponse.json({ ok: true, data }, { status: 200 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unexpected error' }, { status: 500 })
  }
}

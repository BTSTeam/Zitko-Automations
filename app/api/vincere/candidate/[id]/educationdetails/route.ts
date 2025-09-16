import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

const VINCERE_BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requiredEnv()

    const session: any = await getSession()
    const idToken = session.tokens?.idToken || ''
    const userKey = session.user?.email || session.sessionId || 'anonymous'

    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'Not connected to Vincere' }, { status: 401 })
    }

    const url = `${VINCERE_BASE}/api/v2/candidate/${encodeURIComponent(params.id)}/educationdetails`
    const res = await fetch(url, {
      headers: {
        'id-token': idToken,
        'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
        accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ ok: false, status: res.status, error: safeError(text) }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data, { status: 200 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unexpected error' }, { status: 500 })
  }
}

function safeError(s: string) {
  return s.length > 800 ? s.slice(0, 800) + '…' : s
}

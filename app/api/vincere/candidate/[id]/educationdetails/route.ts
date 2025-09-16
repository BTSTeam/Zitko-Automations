import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

const VINCERE_BASE = 'https://zitko.vincere.io/api/v2'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session: any = await getSession()
    if (!session?.vincere) {
      return NextResponse.json({ ok: false, error: 'Not connected to Vincere' }, { status: 401 })
    }

    const idToken = await refreshIdToken(session)

    const url = `${VINCERE_BASE}/candidate/${encodeURIComponent(params.id)}/educationdetails`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { ok: false, status: res.status, error: safeError(text) },
        { status: res.status }
      )
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

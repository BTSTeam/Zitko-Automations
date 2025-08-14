import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  requiredEnv()

  const session = await getSession()
  const idToken = session.tokens?.idToken
  if (!idToken) {
    return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })
  }

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const url = `${base}/api/v2/position/${encodeURIComponent(params.id)}`

  const resp = await fetch(url, {
    headers: {
      'id-token': idToken,
      'x-api-key': config.VINCERE_API_KEY,
    },
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return NextResponse.json({ error: 'Vincere request failed', detail: text }, { status: 400 })
  }

  const data = await resp.json()
  return NextResponse.json(data)
}

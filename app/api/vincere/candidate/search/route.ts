import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

export async function POST(req: NextRequest) {
  requiredEnv()
  const session = await getSession()
  const userKey = session.user?.email || session.sessionId || ''
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')

  // TODO: build your real matrix vars; placeholder shown:
  const url = `${base}/api/v2/candidate/search/`

  async function call(idToken?: string) {
    return fetch(url, {
      method: 'GET',
      headers: {
        ...(idToken ? { 'id-token': idToken } : {}),
        'x-api-key': config.VINCERE_API_KEY,
      },
    })
  }

  let idToken = session.tokens?.idToken
  let resp = await call(idToken)

  if (resp.status === 401 || resp.status === 403) {
    if (await refreshIdToken(userKey)) {
      const s2 = await getSession()
      idToken = s2.tokens?.idToken
      resp = await call(idToken)
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return NextResponse.json({ error: 'Vincere search failed', detail: text }, { status: resp.status || 400 })
  }

  const data = await resp.json()
  return NextResponse.json(data)
}

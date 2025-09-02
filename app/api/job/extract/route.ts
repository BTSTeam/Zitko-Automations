export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

export async function POST(req: NextRequest) {
  try {
    requiredEnv()
    const session = await getSession()
    const idToken = session.tokens?.idToken || ''
    const userKey = session.user?.email || session.sessionId || 'anonymous'
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere.' }, { status: 401 })

    const body = await req.json()
    if (!body?.jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const url = `${base}/api/v2/job/${body.jobId}`

    const headers = new Headers()
    headers.set('id-token', idToken)
    headers.set('x-api-key', config.VINCERE_API_KEY)

    let resp = await fetch(url, { method: 'GET', headers })
    if (resp.status === 401 || resp.status === 403) {
      await refreshIdToken(userKey)
      const s2 = await getSession()
      const id2 = s2.tokens?.idToken || ''
      headers.set('id-token', id2)
      resp = await fetch(url, { method: 'GET', headers })
    }

    const json = await resp.json()
    if (!resp.ok) return NextResponse.json({ error: 'Failed to retrieve job', detail: json }, { status: 400 })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

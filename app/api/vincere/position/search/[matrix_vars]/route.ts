// app/api/vincere/position/search/[matrix_vars]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

export async function GET(
  req: NextRequest,
  { params }: { params: { matrix_vars: string } }
) {
  try {
    requiredEnv()

    const session = await getSession()
    const userKey = session.user?.email || session.sessionId || ''
    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const matrix = (params.matrix_vars || '').trim()

    const apiBase = `${base}/api/v2/position/search/${matrix}`
    const url = encodeURI(apiBase) + (req.nextUrl.search || '')

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
      const refreshed = await refreshIdToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        idToken = s2.tokens?.idToken
        resp = await call(idToken)
      }
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return NextResponse.json(
        { error: 'Vincere position search failed', detail: text },
        { status: resp.status || 400 }
      )
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Unexpected error' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config } from '@/lib/config'
import { buildCandidateSearchUrl } from '@/lib/search'

export async function POST(req: NextRequest) {
  const session = await getSession()
  const idToken = session.tokens?.id_token
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const body = await req.json()
  const url = buildCandidateSearchUrl(config.VINCERE_TENANT_API_BASE, body || {})

  const upstream = await fetch(url, {
    headers: {
      'id-token': idToken,
      'x-api-key': config.VINCERE_API_KEY,
      'accept': 'application/json'
    }
  })
  const text = await upstream.text()
  return new NextResponse(text, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' } })
}

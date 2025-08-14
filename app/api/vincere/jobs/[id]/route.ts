import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config } from '@/lib/config'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  const idToken = session.tokens?.id_token
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const url = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '') + '/api/v2/position/' + encodeURIComponent(params.id)

  const upstream = await fetch(url, {
    method: 'GET',
    headers: {
      'id-token': idToken,
      'x-api-key': config.VINCERE_API_KEY
    }
  })

  const text = await upstream.text()
  let data: any = text
  try { data = JSON.parse(text) } catch {}
  return new NextResponse(text, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' } })
}

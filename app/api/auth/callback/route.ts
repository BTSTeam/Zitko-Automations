import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'

export async function GET(req: NextRequest) {
  requiredEnv()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  if (error) return NextResponse.json({ error }, { status: 400 })
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const session = await getSession()
  const codeVerifier = session.codeVerifier
  if (!codeVerifier) return NextResponse.json({ error: 'Missing PKCE verifier' }, { status: 400 })

  const tokenUrl = config.VINCERE_ID_BASE + '/oauth2/token'
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.VINCERE_CLIENT_ID,
    redirect_uri: config.REDIRECT_URI,
    code_verifier: codeVerifier,
  })

  const resp = await fetch(tokenUrl, { method: 'POST', body })
  const json = await resp.json()
  if (!resp.ok) {
    return NextResponse.json({ error: 'Token exchange failed', detail: json }, { status: 400 })
  }

  session.tokens = {
    idToken: json.id_token,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
  }
  await session.save()

  return NextResponse.redirect(new URL('/dashboard', req.url))
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import crypto from 'crypto'
import { saveRefreshToken } from '@/lib/tokenStore'

type TokenResponseSnake = {
  access_token?: string
  refresh_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export async function GET(req: NextRequest) {
  requiredEnv()

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  if (error) return NextResponse.json({ error }, { status: 400 })
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const session = await getSession()
  const codeVerifier = session.codeVerifier
  if (!codeVerifier) {
    return NextResponse.json({ error: 'Missing PKCE verifier' }, { status: 400 })
  }

  // Exchange code for tokens
  const tokenUrl = `${config.VINCERE_ID_BASE.replace(/\/$/, '')}/oauth2/token`
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.VINCERE_CLIENT_ID,
    redirect_uri: config.REDIRECT_URI,
    code_verifier: codeVerifier,
  })

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return NextResponse.json({ error: 'Token exchange failed', detail: text }, { status: 400 })
  }

  const tokens: TokenResponseSnake = await resp.json()

  // Identify this browser/user for server-side refresh-token storage
  let userKey = session.user?.email || session.sessionId
  if (!userKey) {
    session.sessionId = crypto.randomUUID()
    userKey = session.sessionId
  }

  // Keep cookie tiny: store only id_token
  session.tokens = { idToken: tokens.id_token ?? '' }

  // Save refresh_token in Upstash (server-side)
  await saveRefreshToken(userKey!, tokens.refresh_token)

  session.codeVerifier = null
  await session.save()

  // Send user into the app
  return NextResponse.redirect(new URL('/dashboard', req.url))
}

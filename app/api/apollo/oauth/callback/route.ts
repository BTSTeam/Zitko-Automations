// app/api/apollo/oauth/callback/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession, saveApolloAccessToken } from '@/lib/session'
import { saveApolloRefreshToken } from '@/lib/apolloTokenStore'
import crypto from 'node:crypto'

const APOLLO_AUTH_URL = 'https://app.apollo.io/api/v1/oauth/token'
const REDIRECT_URI = process.env.APOLLO_OAUTH_REDIRECT_URI

export async function GET(req: NextRequest) {
  if (!REDIRECT_URI) {
    return NextResponse.json({ error: 'Missing env: APOLLO_OAUTH_REDIRECT_URI' }, { status: 500 })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard?error=missing_code', req.url))
  }

  // Optional CSRF check if we set state cookie during /authorize
  const stateCookie = req.cookies.get('apollo_oauth_state')?.value
  if (stateCookie && stateCookie !== state) {
    return NextResponse.redirect(new URL('/dashboard?error=state_mismatch', req.url))
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.APOLLO_OAUTH_CLIENT_ID!,
      client_secret: process.env.APOLLO_OAUTH_CLIENT_SECRET!,
      redirect_uri: REDIRECT_URI,
      code,
    })

    const tokenRes = await fetch(APOLLO_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    })

    if (!tokenRes.ok) {
      const errTxt = await tokenRes.text()
      return NextResponse.redirect(
        new URL(`/dashboard?error=token_exchange_failed&detail=${encodeURIComponent(errTxt)}`, req.url)
      )
    }

    const tokens = await tokenRes.json() as { access_token?: string; refresh_token?: string }

    // Identify a stable user key to store the refresh token
    const session = await getSession()
    let userKey = session.user?.email || session.sessionId
    if (!userKey) {
      session.sessionId = crypto.randomUUID()
      userKey = session.sessionId
    }

    // Save access token to session; save refresh token to Redis
    await saveApolloAccessToken(tokens.access_token ?? '')
    await saveApolloRefreshToken(userKey!, tokens.refresh_token)

    await session.save()

    const res = NextResponse.redirect(new URL('/dashboard?connected=apollo', req.url))
    res.cookies.delete('apollo_oauth_state')
    return res
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/dashboard?error=unexpected&detail=${encodeURIComponent(String(e?.message ?? e))}`, req.url)
    )
  }
}

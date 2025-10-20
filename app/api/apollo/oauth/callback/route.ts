// app/api/apollo/oauth/callback/route.ts
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const clientId = process.env.APOLLO_CLIENT_ID
  const clientSecret = process.env.APOLLO_CLIENT_SECRET
  const redirectUri = process.env.APOLLO_REDIRECT_URI

  if (!code || !clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Missing code or OAuth environment variables' },
      { status: 400 }
    )
  }

  // Exchange the code for tokens
  const tokenResp = await fetch('https://app.apollo.io/api/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })

  const tokens = await tokenResp.json()
  if (!tokenResp.ok) {
    return NextResponse.json(
      { error: 'Token exchange failed', details: tokens },
      { status: 502 }
    )
  }

  // Store tokens in cookie
  const res = NextResponse.redirect('/dashboard')
  res.cookies.set('apollo_oauth', JSON.stringify(tokens), {
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  return res
}

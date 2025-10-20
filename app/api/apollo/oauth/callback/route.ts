// app/api/apollo/oauth/callback/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requiredApolloEnv, exchangeCodeForTokens, getCookie, delCookie, setCookie } from '@/lib/apolloOAuth'

/**
 * After successful exchange, we set an httpOnly cookie with the Apollo tokens.
 * For production, you likely want to persist per-user in Redis/DB tied to your user id
 * and keep only a small "connected" flag in cookies. This is a minimal working setup.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error') || url.searchParams.get('status_code') || url.searchParams.get('error_message')

  // If Apollo redirected with an error, surface it nicely
  if (err) {
    const headers = new Headers()
    headers.append('Set-Cookie', delCookie('apollo_oauth_state'))
    return NextResponse.redirect(new URL(`/dashboard?apollo_error=${encodeURIComponent(String(err))}`, url.origin), { headers })
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 })
  }

  // CSRF check
  const cookieState = getCookie(req, 'apollo_oauth_state')
  if (!cookieState || cookieState !== state) {
    const headers = new Headers()
    headers.append('Set-Cookie', delCookie('apollo_oauth_state'))
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400, headers })
  }

  try {
    const { clientId, clientSecret, redirectUri } = requiredApolloEnv()
    const tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri })

    // Clear state cookie
    const headers = new Headers()
    headers.append('Set-Cookie', delCookie('apollo_oauth_state'))

    // Store tokens in an httpOnly cookie (short-term). Prefer DB in real deployments.
    const blob = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user_id: tokens.user_id,
      // expires_in is seconds from now; compute absolute expiry on client if needed
      expires_in: tokens.expires_in ?? 3600,
      obtained_at: Date.now(),
    })

    // Cookie lifetime: cap at an hour for access; you still have refresh_token server-side
    headers.append('Set-Cookie', setCookie('apollo_oauth', blob, Math.min(tokens.expires_in ?? 3600, 3600)))

    // Redirect user back to Sourcing page
    const redirectTo = new URL('/dashboard?apollo=connected', url.origin)
    return NextResponse.redirect(redirectTo, { headers })
  } catch (e: any) {
    const headers = new Headers()
    headers.append('Set-Cookie', delCookie('apollo_oauth_state'))
    return NextResponse.redirect(new URL(`/dashboard?apollo_error=${encodeURIComponent(e?.message || 'OAuth exchange failed')}`, new URL(req.url).origin), { headers })
  }
}

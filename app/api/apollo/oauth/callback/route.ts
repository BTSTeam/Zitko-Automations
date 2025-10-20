// app/api/apollo/oauth/callback/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

function requiredApolloEnv() {
  const missing: string[] = []
  if (!process.env.APOLLO_CLIENT_ID) missing.push('APOLLO_CLIENT_ID')
  if (!process.env.APOLLO_CLIENT_SECRET) missing.push('APOLLO_CLIENT_SECRET')
  if (!process.env.APOLLO_REDIRECT_URI) missing.push('APOLLO_REDIRECT_URI')
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
}

/**
 * GET /api/apollo/oauth/callback
 *
 * Handles Apollo OAuth redirection:
 *  - Verifies `state` against session (CSRF protection)
 *  - Exchanges `code` for access & refresh tokens
 *  - Stores tokens in the session under `session.apollo`
 *  - Redirects to the original `next` path (or /dashboard)
 */
export async function GET(req: NextRequest) {
  try {
    requiredApolloEnv()

    const session = await getSession()

    const url = new URL(req.url)
    const code = url.searchParams.get('code') || ''
    const returnedState = url.searchParams.get('state') || ''
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Early error from provider
    if (error) {
      return NextResponse.json(
        { error: `Apollo OAuth error: ${error}`, detail: errorDescription || '' },
        { status: 400 },
      )
    }

    if (!code) {
      return NextResponse.json({ error: 'Missing authorization code.' }, { status: 400 })
    }

    // CSRF/state check
    const expectedState = (session as any).oauthApolloState as string | undefined
    if (!expectedState || returnedState !== expectedState) {
      return NextResponse.json({ error: 'Invalid or missing OAuth state.' }, { status: 400 })
    }

    // We’ll redirect the user back here after success
    const nextPath = ((session as any).oauthApolloNext as string | undefined) || '/dashboard'

    // Clear one-time values
    delete (session as any).oauthApolloState
    delete (session as any).oauthApolloNext

    // Exchange code for tokens
    const tokenUrl = 'https://app.apollo.io/api/v1/oauth/token'
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.APOLLO_CLIENT_ID!,
      client_secret: process.env.APOLLO_CLIENT_SECRET!,
      redirect_uri: process.env.APOLLO_REDIRECT_URI!,
      code,
    })

    const tokenResp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      cache: 'no-store',
    })

    if (!tokenResp.ok) {
      const text = await tokenResp.text().catch(() => '')
      return NextResponse.json(
        { error: `Apollo token exchange failed (${tokenResp.status})`, detail: text },
        { status: 502 },
      )
    }

    const tok = (await tokenResp.json()) as {
      access_token?: string
      token_type?: string
      expires_in?: number
      refresh_token?: string
      scope?: string
      created_at?: number
    }

    if (!tok?.access_token) {
      return NextResponse.json({ error: 'Apollo token response missing access_token.' }, { status: 502 })
    }

    // Compute an absolute expiry timestamp (seconds since epoch)
    const createdAt = typeof tok.created_at === 'number' ? tok.created_at : Math.floor(Date.now() / 1000)
    const expiresAt = tok.expires_in ? createdAt + tok.expires_in : undefined

    // Store under session.apollo (kept separate from Vincere tokens)
    ;(session as any).apollo = {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? '',
      tokenType: tok.token_type || 'Bearer',
      scope: tok.scope || '',
      createdAt,
      expiresAt, // seconds since epoch
    }
    await session.save()

    // Send user back to where they came from (or dashboard)
    return NextResponse.redirect(nextPath, { status: 302 })
  } catch (err: any) {
    const message = err?.message || 'Apollo OAuth callback failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// app/api/apollo/oauth/authorize/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'

const AUTHZ_HASH_BASE = 'https://app.apollo.io/#/oauth/authorize'

export async function GET(_req: NextRequest) {
  const clientId = process.env.APOLLO_OAUTH_CLIENT_ID
  const redirectUri = process.env.APOLLO_OAUTH_REDIRECT_URI
  const scopes = (process.env.APOLLO_OAUTH_SCOPES || 'read_user_profile contacts_read accounts_read').trim()

  if (!clientId || !redirectUri) {
    console.error('[Apollo OAuth] Missing env', { clientId: !!clientId, redirectUri: !!redirectUri })
    return NextResponse.json({ error: 'Missing Apollo OAuth env (client id / redirect uri)' }, { status: 500 })
  }

  const state = crypto.randomBytes(16).toString('hex')

  // IMPORTANT: build query AFTER the hash route
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state,
  }).toString()

  const authorizeUrl = `${AUTHZ_HASH_BASE}?${qs}`

  const res = NextResponse.redirect(authorizeUrl)
  res.cookies.set('apollo_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
  })
  return res
}

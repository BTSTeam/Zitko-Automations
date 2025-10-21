// app/api/apollo/oauth/authorize/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { APOLLO } from '@/lib/config'

const AUTHZ_BASE = 'https://app.apollo.io/#/oauth/authorize'

export async function GET(_req: NextRequest) {
  const REDIRECT_URI = APOLLO.REDIRECT_URI
  if (!APOLLO.CLIENT_ID || !REDIRECT_URI) {
    return NextResponse.json({ error: 'Missing Apollo OAuth env (client_id/redirect_uri)' }, { status: 500 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const scopes = (APOLLO.SCOPES || 'read_user_profile contacts_read accounts_read').split(/\s+/).filter(Boolean)

  const authorizeUrl = new URL(AUTHZ_BASE)
  authorizeUrl.searchParams.set('client_id', APOLLO.CLIENT_ID)
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', scopes.join(' '))
  authorizeUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authorizeUrl.toString())
  res.cookies.set('apollo_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
  })
  return res
}

// app/api/apollo/oauth/authorize/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requiredApolloEnv, buildAuthorizeUrl, randomState, setCookie } from '@/lib/apolloOAuth'

export async function GET(_req: NextRequest) {
  try {
    const { clientId, redirectUri } = requiredApolloEnv()

    // Choose scopes you registered in Apollo (examples below).
    // If you omit scope here, Apollo uses the scopes defined at registration.
    const scope = [
      'read_user_profile',     // recommended by Apollo docs
      // add any others you registered, e.g. 'contacts_search', 'person_read', 'organization_read', etc.
    ]

    const state = randomState()
    const authUrl = buildAuthorizeUrl({ clientId, redirectUri, scope, state })

    // Set short-lived state cookie for CSRF protection (5 minutes)
    const headers = new Headers()
    headers.append('Set-Cookie', setCookie('apollo_oauth_state', state, 300))
    headers.append('Location', authUrl)
    return new NextResponse(null, { status: 307, headers })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'OAuth authorize failed' }, { status: 500 })
  }
}

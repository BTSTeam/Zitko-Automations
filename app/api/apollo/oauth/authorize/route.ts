// app/api/apollo/oauth/authorize/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

/**
 * Ensure the required Apollo OAuth env vars exist.
 * Required now: APOLLO_CLIENT_ID, APOLLO_REDIRECT_URI
 * Optional:     APOLLO_SCOPES (space-separated)
 */
function requiredApolloEnv() {
  const missing: string[] = []
  if (!process.env.APOLLO_CLIENT_ID) missing.push('APOLLO_CLIENT_ID')
  if (!process.env.APOLLO_REDIRECT_URI) missing.push('APOLLO_REDIRECT_URI')
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  }
}

/** Tiny crypto-safe state string for CSRF protection */
function makeState(len = 24) {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => ('0' + b.toString(16)).slice(-2)).join('')
}

/**
 * GET /api/apollo/oauth/authorize
 *
 * Redirects the user to Apollo's OAuth 2.0 authorization page.
 * We store a CSRF `state` and optional `next` (where to return after callback) in the session.
 *
 * Query params:
 *   next (optional): a relative path to redirect the user to after the OAuth callback completes.
 */
export async function GET(req: NextRequest) {
  try {
    requiredApolloEnv()

    const clientId = process.env.APOLLO_CLIENT_ID!
    const redirectUri = process.env.APOLLO_REDIRECT_URI!
    // If you pass scopes in the URL, include read_user_profile explicitly per Apollo docs.
    const scopes =
      (process.env.APOLLO_SCOPES?.trim() ||
        'contacts_search person_read read_user_profile') // space-separated

    // Capture optional `next` param to bring the user back to the UI section they came from.
    const url = new URL(req.url)
    const nextParam = url.searchParams.get('next') || '/dashboard'

    // Create & store state
    const state = makeState()
    const session = await getSession()
    ;(session as any).oauthApolloState = state
    ;(session as any).oauthApolloNext = nextParam
    await session.save()

    // Build Apollo authorize URL
    const auth = new URL('https://app.apollo.io/#/oauth/authorize')
    auth.searchParams.set('client_id', clientId)
    auth.searchParams.set('redirect_uri', redirectUri)
    auth.searchParams.set('response_type', 'code')
    auth.searchParams.set('scope', scopes)
    auth.searchParams.set('state', state)

    // 302/307 both fine for redirects; use 302 here
    return NextResponse.redirect(auth.toString(), { status: 302 })
  } catch (err: any) {
    const message =
      err?.message || 'Failed to initiate Apollo OAuth authorization.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

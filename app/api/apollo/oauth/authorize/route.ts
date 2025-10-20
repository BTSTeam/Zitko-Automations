// app/api/apollo/oauth/authorize/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.APOLLO_OAUTH_CLIENT_ID
  const redirectUri = process.env.APOLLO_OAUTH_REDIRECT_URI
  const scopes = process.env.APOLLO_SCOPE || 'contacts_search person_read' // partner scopes

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Missing Apollo OAuth environment variables' },
      { status: 500 }
    )
  }

  // If your account is partner-enabled, Apollo expects the hash authorize route:
  // https://app.apollo.io/#/oauth/authorize
  // If that still 404s for you, switch to: https://api.apollo.io/v1/oauth/authorize
  const url = new URL('https://app.apollo.io/#/oauth/authorize')

  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scopes)
  url.searchParams.set('state', crypto.randomUUID())

  return NextResponse.redirect(url.toString(), 302)
}

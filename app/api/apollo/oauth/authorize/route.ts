// app/api/apollo/oauth/authorize/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.APOLLO_OAUTH_CLIENT_ID
  const redirectUri = process.env.APOLLO_OAUTH_REDIRECT_URI
  const scopes = process.env.APOLLO_SCOPE || 'people.read organizations.read'

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Missing Apollo OAuth environment variables' },
      { status: 500 }
    )
  }

  const url = new URL('https://api.apollo.io/v1/oauth/authorize') // ← updated host/path
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scopes)

  return NextResponse.redirect(url.toString(), 302)
}

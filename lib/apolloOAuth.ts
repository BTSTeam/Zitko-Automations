// lib/apolloOAuth.ts
import type { NextRequest } from 'next/server'

export function requiredApolloEnv() {
  const { APOLLO_OAUTH_CLIENT_ID, APOLLO_OAUTH_CLIENT_SECRET, APOLLO_OAUTH_REDIRECT_URI } = process.env
  if (!APOLLO_OAUTH_CLIENT_ID || !APOLLO_OAUTH_CLIENT_SECRET || !APOLLO_OAUTH_REDIRECT_URI) {
    throw new Error('Missing Apollo OAuth env: APOLLO_OAUTH_CLIENT_ID, APOLLO_OAUTH_CLIENT_SECRET, APOLLO_OAUTH_REDIRECT_URI')
  }
  return { clientId: APOLLO_OAUTH_CLIENT_ID, clientSecret: APOLLO_OAUTH_CLIENT_SECRET, redirectUri: APOLLO_OAUTH_REDIRECT_URI }
}

export function randomState(len = 32) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function buildAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  scope?: string[]
  state: string
}) {
  const { clientId, redirectUri, scope = [], state } = params
  const url = new URL('https://app.apollo.io/#/oauth/authorize') // per official docs
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  if (scope.length) url.searchParams.set('scope', scope.join(' '))
  url.searchParams.set('state', state)
  return url.toString()
}

/** Minimal cookie helpers */
export function setCookie(name: string, value: string, maxAgeSec: number) {
  const secure = process.env.NODE_ENV === 'production'
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec};${secure ? ' Secure;' : ''}`
}
export function getCookie(req: NextRequest, name: string) {
  return req.cookies.get(name)?.value
}
export function delCookie(name: string) {
  const secure = process.env.NODE_ENV === 'production'
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${secure ? ' Secure;' : ''}`
}

/** Exchange code -> access/refresh token */
export async function exchangeCodeForTokens(args: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}) {
  const { code, clientId, clientSecret, redirectUri } = args
  const tokenUrl = 'https://app.apollo.io/api/v1/oauth/token' // per official docs
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  // redirect_uri is optional in Apollo docs but safe to include if you registered multiple
  body.set('redirect_uri', redirectUri)

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Apollo token exchange failed ${res.status}: ${txt}`)
  }
  return (await res.json()) as {
    access_token: string
    token_type?: string
    expires_in?: number
    refresh_token?: string
    scope?: string
    user_id?: string
  }
}

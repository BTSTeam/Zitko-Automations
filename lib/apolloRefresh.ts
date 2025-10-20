// lib/apolloRefresh.ts
//
// Handles refreshing Apollo OAuth tokens and ensuring a valid access token exists.
// Similar in structure to lib/vincereRefresh.ts
//
import { getSession } from '@/lib/session'

function requiredApolloEnv() {
  const missing: string[] = []
  if (!process.env.APOLLO_CLIENT_ID) missing.push('APOLLO_CLIENT_ID')
  if (!process.env.APOLLO_CLIENT_SECRET) missing.push('APOLLO_CLIENT_SECRET')
  if (!process.env.APOLLO_REDIRECT_URI) missing.push('APOLLO_REDIRECT_URI')
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)
}

type ApolloAuth = {
  accessToken: string
  refreshToken: string
  tokenType: string
  scope?: string
  createdAt?: number
  expiresAt?: number
}

/**
 * Refreshes the Apollo OAuth token if expired or near expiry.
 * Updates the stored session accordingly.
 */
export async function refreshApolloToken(): Promise<string | null> {
  requiredApolloEnv()
  const session = await getSession()
  const apollo = (session as any).apollo as ApolloAuth | undefined
  if (!apollo) return null

  const now = Math.floor(Date.now() / 1000)
  if (apollo.expiresAt && apollo.expiresAt > now + 120) {
    // token still valid for > 2min
    return apollo.accessToken
  }

  if (!apollo.refreshToken) {
    console.warn('Apollo token expired but no refresh token stored.')
    return null
  }

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: apollo.refreshToken,
    client_id: process.env.APOLLO_CLIENT_ID!,
    client_secret: process.env.APOLLO_CLIENT_SECRET!,
    redirect_uri: process.env.APOLLO_REDIRECT_URI!,
  })

  const res = await fetch('https://app.apollo.io/api/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('Apollo refresh error', res.status, text)
    return null
  }

  const tok = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    created_at?: number
    token_type?: string
  }

  const createdAt = tok.created_at ?? Math.floor(Date.now() / 1000)
  const expiresAt = tok.expires_in ? createdAt + tok.expires_in : undefined

  const updated: ApolloAuth = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? apollo.refreshToken,
    tokenType: tok.token_type || apollo.tokenType,
    scope: apollo.scope,
    createdAt,
    expiresAt,
  }

  ;(session as any).apollo = updated
  await session.save()

  return updated.accessToken
}

/**
 * Ensures we have a valid Apollo token in session, refreshing if necessary.
 * Returns null if not connected or refresh fails.
 */
export async function ensureApolloToken(): Promise<string | null> {
  const session = await getSession()
  const apollo = (session as any).apollo as ApolloAuth | undefined
  if (!apollo?.accessToken) return null

  const now = Math.floor(Date.now() / 1000)
  if (!apollo.expiresAt || apollo.expiresAt > now + 120) return apollo.accessToken

  return await refreshApolloToken()
}

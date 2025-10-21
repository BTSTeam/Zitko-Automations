// lib/apolloRefresh.ts
import { getApolloRefreshToken, saveApolloRefreshToken } from './apolloTokenStore'
import { saveApolloAccessToken } from './session'
import { config } from './config'

const APOLLO_TOKEN_URL = 'https://app.apollo.io/api/v1/oauth/token'

export async function refreshApolloAccessToken(userKey: string) {
  const refreshToken = await getApolloRefreshToken(userKey)
  if (!refreshToken) return false

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.APOLLO_CLIENT_ID!,
    client_secret: config.APOLLO_CLIENT_SECRET!,
    refresh_token: refreshToken,
  })

  const resp = await fetch(APOLLO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!resp.ok) return false

  const tokens = await resp.json() as any
  // Save new access token in session
  await saveApolloAccessToken(tokens.access_token)
  // Rotate refresh token if provided
  if (tokens.refresh_token) {
    await saveApolloRefreshToken(userKey, tokens.refresh_token)
  }
  return true
}

// lib/vincereRefresh.ts
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { getRefreshToken, saveRefreshToken } from '@/lib/tokenStore'

export async function refreshIdToken(userKey: string) {
  const refreshToken = await getRefreshToken(userKey)
  if (!refreshToken) return false

  const url = `${config.VINCERE_ID_BASE.replace(/\/$/, '')}/oauth2/token`
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.VINCERE_CLIENT_ID,
    refresh_token: refreshToken,
  })

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!resp.ok) return false

  const tok = await resp.json() as any

  // keep cookie tiny: only id_token
  const session = await getSession()
  session.tokens = { idToken: tok.id_token ?? '' }
  await session.save()

  // rotate if provider returns a new refresh token
  if (tok.refresh_token) await saveRefreshToken(userKey, tok.refresh_token)
  return true
}

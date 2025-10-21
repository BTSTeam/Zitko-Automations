// lib/session.ts
import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export type Tokens = {
  // Vincere keeps using this (don’t remove/rename: other code reads tokens.idToken)
  idToken?: string

  // Apollo
  apolloAccessToken?: string
  // (we keep refresh token in Redis; add here only if you want to mirror it in-session)
  // apolloRefreshToken?: string

  // Back-compat fields (if you used these elsewhere)
  accessToken?: string
  refreshToken?: string
}

export type SessionData = {
  tokens?: Tokens | null
  codeVerifier?: string | null
  user?: { email: string } | null
  sessionId?: string | null
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD as string,
  cookieName: 'zitko.session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  },
}

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions)
}

export async function saveTokens(partial: Partial<Tokens>) {
  const session = await getSession()
  session.tokens = { ...(session.tokens ?? {}), ...partial }
  await session.save()
}

// Helper used by lib/apolloRefresh.ts and the OAuth callback
export async function saveApolloAccessToken(token: string) {
  const session = await getSession()
  session.tokens = { ...(session.tokens ?? {}), apolloAccessToken: token }
  await session.save()
}

export async function clearSession() {
  const session = await getSession()
  await session.destroy()
}

// lib/session.ts
import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export type Tokens = {
  vincereIdToken?: string
  apolloAccessToken?: string
  apolloRefreshToken?: string
  idToken?: string
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

export async function clearSession() {
  const session = await getSession()
  await session.destroy()
}

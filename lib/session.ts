// lib/session.ts
import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export type Tokens = {
  accessToken?: string
  refreshToken?: string
  idToken?: string
}

export type SessionUser = {
  email: string
  role: 'Admin' | 'User'
  active?: boolean
}

export type SessionData = {
  tokens?: Tokens | null
  codeVerifier?: string | null
  user?: SessionUser | null
  sessionId?: string | null
  // optional, handy if you later use the password gate for AC
  acUnlocked?: boolean
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

export async function saveTokens(tokens: Tokens) {
  const session = await getSession()
  session.tokens = tokens
  await session.save()
}

export async function clearSession() {
  const session = await getSession()
  await session.destroy()
}

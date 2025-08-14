import { IronSessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'

export type VincereSession = {
  codeVerifier?: string
  tokens?: {
    access_token: string
    id_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }
}

const sessionCookieName = 'vin_sess'

export async function getSession() {
  const cookieStore = cookies()
  const password = process.env.SESSION_PASSWORD
  if (!password) throw new Error('SESSION_PASSWORD is required')
  const session = await getIronSession<VincereSession>(
    { cookies: cookieStore },
    {
      password,
      cookieName: sessionCookieName,
      cookieOptions: {
        secure: true,
        sameSite: 'lax',
        httpOnly: true
      }
    } as IronSessionOptions
  )
  return session
}

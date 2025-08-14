// lib/session.ts
import { getIronSession, IronSessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type Tokens = {
  id_token: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type SessionData = {
  codeVerifier?: string;
  tokens?: Tokens;         // <-- add this
};

const sessionOptions: IronSessionOptions = {
  cookieName: 'zitko.session',
  password: process.env.SESSION_PASSWORD as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    path: '/',
  },
};

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

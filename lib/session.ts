import { getIronSession, IronSessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

type SessionData = {
  codeVerifier?: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
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


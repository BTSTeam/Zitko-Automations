import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';

type TokenResponse = {
  id_token: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export async function GET(req: NextRequest) {
  requiredEnv();

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const session = await getSession();
  const codeVerifier = session.codeVerifier;
  if (!codeVerifier) {
    return NextResponse.json({ error: 'Missing PKCE verifier' }, { status: 400 });
  }

  // Exchange code for tokens
  const tokenUrl = `${config.VINCERE_ID_BASE}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.VINCERE_CLIENT_ID,
    redirect_uri: config.REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    return NextResponse.json({ error: 'Token exchange failed', detail: txt }, { status: 500 });
  }

  const tokens = (await res.json()) as TokenResponse;

  // Save what you actually use into the session
  session.idToken = tokens.id_token;
  session.accessToken = tokens.access_token;
  session.refreshToken = tokens.refresh_token;
  session.codeVerifier = undefined;
  await session.save();

  // Use absolute URL for redirect
  return NextResponse.redirect(new URL('/test', req.url));
}

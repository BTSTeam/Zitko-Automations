import { NextRequest, NextResponse } from 'next/server';

const APOLLO_AUTH_URL = 'https://app.apollo.io/api/v1/oauth/token';
const REDIRECT_URI = process.env.APOLLO_OAUTH_REDIRECT_URI;

if (!REDIRECT_URI) {
  throw new Error('Missing env: APOLLO_OAUTH_REDIRECT_URI');
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const stateCookie = req.cookies.get('apollo_oauth_state')?.value;

  if (!code) {
    return NextResponse.redirect(new URL('/integrations/apollo?error=missing_code', req.url));
  }
  if (stateCookie && stateCookie !== state) {
    return NextResponse.redirect(new URL('/integrations/apollo?error=state_mismatch', req.url));
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.APOLLO_OAUTH_CLIENT_ID!,
    client_secret: process.env.APOLLO_OAUTH_CLIENT_SECRET!,
    redirect_uri: REDIRECT_URI,
    code,
  });

  const tokenRes = await fetch(APOLLO_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!tokenRes.ok) {
    const errTxt = await tokenRes.text();
    return NextResponse.redirect(
      new URL(`/integrations/apollo?error=token_exchange_failed&detail=${encodeURIComponent(errTxt)}`, req.url)
    );
  }

  // const tokens = await tokenRes.json();  // persist securely on the server
  const res = NextResponse.redirect(new URL('/integrations/apollo?connected=1', req.url));
  res.cookies.delete('apollo_oauth_state');
  return res;
}

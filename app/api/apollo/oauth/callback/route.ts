// app/api/apollo/oauth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';

const APOLLO_AUTH_URL = 'https://app.apollo.io/api/v1/oauth/token';
const REDIRECT_URI = process.env.APOLLO_OAUTH_REDIRECT_URI;

export async function GET(req: NextRequest) {
  if (!REDIRECT_URI) {
    return NextResponse.json({ error: 'Missing env: APOLLO_OAUTH_REDIRECT_URI' }, { status: 500 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard?error=missing_code', req.url));
  }

  // Optional CSRF check: only enforce if we actually set a cookie earlier.
  const stateCookie = req.cookies.get('apollo_oauth_state')?.value;
  if (stateCookie && stateCookie !== state) {
    return NextResponse.redirect(new URL('/dashboard?error=state_mismatch', req.url));
  }

  try {
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
        new URL(`/dashboard?error=token_exchange_failed&detail=${encodeURIComponent(errTxt)}`, req.url)
      );
    }

    // const tokens = await tokenRes.json(); // TODO: persist securely server-side

    const res = NextResponse.redirect(new URL('/dashboard?connected=1', req.url));
    res.cookies.delete('apollo_oauth_state');
    return res;
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/dashboard?error=unexpected&detail=${encodeURIComponent(String(e?.message ?? e))}`, req.url)
    );
  }
}

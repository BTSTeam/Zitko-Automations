import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const AUTHZ_BASE = 'https://app.apollo.io/#/oauth/authorize';
const REDIRECT_URI = process.env.APOLLO_OAUTH_REDIRECT_URI;

if (!REDIRECT_URI) {
  throw new Error('Missing env: APOLLO_OAUTH_REDIRECT_URI');
}

export async function GET(req: NextRequest) {
  const state = crypto.randomBytes(16).toString('hex');
  const scopes = ['read_user_profile', 'contacts_search', 'person_read']; // adjust as needed

  const authorizeUrl = new URL(AUTHZ_BASE);
  authorizeUrl.searchParams.set('client_id', process.env.APOLLO_OAUTH_CLIENT_ID!);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', scopes.join(' '));
  authorizeUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set('apollo_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
  return res;
}

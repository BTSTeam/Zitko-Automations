// app/api/vincere/distributionlists/user/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getSession } from '@/lib/session';
import { refreshIdToken } from '@/lib/vincereRefresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// --------------------------------------------
//  Helpers
// --------------------------------------------

/**
 * Ensure base URL includes /api/v2
 */
function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '');
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`;
  return b;
}

type DistList = {
  id?: number;
  name?: string;
  title?: string;
  list_name?: string;
  [k: string]: any;
};

/**
 * Normalise Vincere distribution list response
 */
function normalizeLists(data: any): DistList[] {
  const raw =
    (Array.isArray(data?.lists) && data.lists) ||
    (Array.isArray(data?.docs) && data.docs) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data) && data) ||
    [];

  return raw
    .map((p: any) => {
      const id =
        p?.id ??
        p?.list_id ??
        p?.distribution_list_id ??
        p?.uid ??
        p?.value ??
        p?.key;

      const name =
        p?.name ??
        p?.list_name ??
        p?.title ??
        p?.label ??
        p?.displayName ??
        '';

      return { id, name };
    })
    .filter((p: any) => p.id);
}

// --------------------------------------------
//  GET /distributionlists/user/{user_id}
// --------------------------------------------

export async function GET(req: NextRequest) {
  try {
    // Get session + id-token
    let session = await getSession();
    let idToken = session.tokens?.idToken;
    const userKey = session.user?.email ?? 'unknown';

    if (!idToken) {
      return NextResponse.json(
        { error: 'Not connected to Vincere' },
        { status: 401 }
      );
    }

    // Build API base
    const RAW_BASE = config.VINCERE_TENANT_API_BASE;
    const BASE = withApiV2(RAW_BASE);

    // Use same env pattern as talent pool route
    const USER_ID =
      process.env.VINCERE_DISTRIBUTIONLIST_USER_ID ||
      process.env.NEXT_PUBLIC_VINCERE_DISTRIBUTIONLIST_USER_ID ||
      process.env.VINCERE_TALENTPOOL_USER_ID || // fallback
      '29018';

    const url = `${BASE}/distributionlists/user/${encodeURIComponent(USER_ID)}`;

    const headers = new Headers({
      'id-token': idToken,
      'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
      accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    });

    const doFetch = () =>
      fetch(url, { method: 'GET', headers, cache: 'no-store' });

    // -------------------------------------------------
    //  Try fetch + refresh token if needed
    // -------------------------------------------------
    let res = await doFetch();
    if (res.status === 401 || res.status === 403) {
      const ok = await refreshIdToken(userKey);
      if (!ok) {
        return NextResponse.json(
          { error: 'Auth refresh failed' },
          { status: 401 }
        );
      }

      session = await getSession();
      idToken = session.tokens?.idToken;
    
      if (!idToken) {
        return NextResponse.json(
          { error: 'No idToken after refresh' },
          { status: 401 }
        );
      }
    
      headers.set('id-token', idToken);
      headers.set('Authorization', `Bearer ${idToken}`);
      res = await doFetch();
    }

    const data = await res.json().catch(() => ({}));
    const lists = normalizeLists(data);

    return NextResponse.json(
      { pools: lists }, // IMPORTANT: return shape matches talent pools
      {
        status: 200,
        headers: {
          'x-vincere-userid': USER_ID,
          'x-vincere-base': BASE,
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

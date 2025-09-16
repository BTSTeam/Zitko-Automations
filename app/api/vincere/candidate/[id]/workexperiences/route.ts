import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

const VINCERE_BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');

// Helper to retry once if the token has expired
async function fetchWithAutoRefresh(
  url: string,
  idToken: string,
  userKey: string
) {
  const headers = new Headers();
  headers.set('id-token', idToken);
  headers.set(
    'x-api-key',
    (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY
  );
  headers.set('accept', 'application/json');

  const doFetch = (h: Headers) =>
    fetch(url, { headers: h, method: 'GET', cache: 'no-store' });

  let resp = await doFetch(headers);
  // If the token is invalid, refresh it once automatically
  if (resp.status === 401 || resp.status === 403) {
    try {
      const refreshed = await refreshIdToken(userKey);
      if (refreshed) {
        const s2: any = await getSession();
        const id2 = s2.tokens?.idToken || '';
        if (id2) {
          headers.set('id-token', id2);
          resp = await doFetch(headers);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return resp;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    requiredEnv();

    const session: any = await getSession();
    const idToken = session.tokens?.idToken || '';
    const userKey = session.user?.email || session.sessionId || 'anonymous';

    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: 'Not connected to Vincere' },
        { status: 401 }
      );
    }

    const url = `${VINCERE_BASE}/api/v2/candidate/${encodeURIComponent(
      params.id
    )}/workexperiences`;
    const res = await fetchWithAutoRefresh(url, idToken, userKey);

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, status: res.status, error: safeError(text) },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unexpected error' },
      { status: 500 }
    );
  }
}

function safeError(s: string) {
  return s.length > 800 ? s.slice(0, 800) + '…' : s;
}

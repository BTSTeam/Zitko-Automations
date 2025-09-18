// app/api/vincere/candidate/[id]/customfields/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

type RouteCtx = { params: { id: string } };

// Use the same base as your other Vincere calls
const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');

async function fetchWithAutoRefresh(url: string, idToken: string, userKey: string) {
  const headers = new Headers();
  headers.set('id-token', idToken);
  headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY);
  headers.set('accept', 'application/json');

  const doFetch = (h: Headers) =>
    fetch(url, { method: 'GET', headers: h, cache: 'no-store' });

  let resp = await doFetch(headers);

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
      // ignore, fall through with original resp
    }
  }

  return resp;
}

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  try {
    // In your codebase requiredEnv() takes no args
    requiredEnv();

    const id = String(params?.id ?? '').trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing candidate id' }, { status: 400 });
    }

    const session: any = await getSession();
    const idToken = session.tokens?.idToken || '';
    const userKey = session.user?.email || session.sessionId || 'anonymous';

    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'Not connected to Vincere' }, { status: 401 });
    }

    const url = `${BASE}/api/v2/candidate/${encodeURIComponent(id)}/customfields`;
    const res = await fetchWithAutoRefresh(url, idToken, userKey);
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, error: text?.slice(0, 800) ?? 'Request failed' },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, data: json ?? {} });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

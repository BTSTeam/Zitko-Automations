// app/api/vincere/candidate/[id]/file/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');
const API_BASE = /\/public-api\/?$/.test(BASE) ? BASE : `${BASE}/public-api`;

async function postJson(url: string, idToken: string, body: unknown) {
  const headers = new Headers();
  headers.set('id-token', idToken);
  headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY);
  headers.set('accept', 'application/json');
  headers.set('content-type', 'application/json');
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    const s = session as any; // tolerate both shapes
    let idToken: string | undefined = s?.vincere?.idToken ?? s?.idToken;
    const userKey: string | undefined = s?.vincere?.userKey ?? s?.userKey;

    if (!idToken || !userKey) {
      return NextResponse.json({ ok: false, error: 'Not connected to Vincere' }, { status: 401 });
    }

    const payload = await req.json();

    // Vincere’s requirements
    if (!payload?.file_name) {
      return NextResponse.json({ ok: false, error: 'file_name is required' }, { status: 400 });
    }
    if (!payload?.url && !payload?.base_64_content) {
      return NextResponse.json({ ok: false, error: 'Provide url or base_64_content' }, { status: 400 });
    }

    const body = {
      document_type_id: payload.document_type_id ?? 1,
      original_cv: payload.original_cv ?? false,
      expiry_date: payload.expiry_date ?? undefined,
      creator_id: payload.creator_id ?? undefined,
      file_name: payload.file_name,
      url: payload.url ?? '',
      base_64_content: payload.base_64_content ?? '',
    };

    const url = `${API_BASE}/candidate/${encodeURIComponent(params.id)}/file`;

    // Attempt + refresh-once (same signature as your working routes)
    let res = await postJson(url, idToken, body);
    if (res.status === 401) {
      const fresh = await refreshIdToken(userKey, idToken).catch(() => null);
      const newToken = fresh?.idToken ?? idToken;
      if (!newToken) {
        return NextResponse.json({ ok: false, error: 'Unable to refresh Vincere session' }, { status: 401 });
      }
      res = await postJson(url, newToken, body);
    }

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, error: text || 'Upload failed' }, { status: res.status });
    }

    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unexpected error' }, { status: 500 });
  }
}

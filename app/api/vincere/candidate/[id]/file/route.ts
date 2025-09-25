// app/api/vincere/candidate/[id]/file/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

const TENANT_BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');
// Ensure we hit the Public API for file upload
const API_BASE = /\/public-api\/?$/.test(TENANT_BASE) ? TENANT_BASE : `${TENANT_BASE}/public-api`;

function buildHeaders(idToken: string) {
  const h = new Headers();
  h.set('id-token', idToken);
  h.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY);
  h.set('accept', 'application/json');
  h.set('content-type', 'application/json');
  return h;
}

async function postOnce(url: string, idToken: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: buildHeaders(idToken),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    requiredEnv();

    const session: any = await getSession();
    // ✅ Mirror the working routes
    let idToken: string = session?.tokens?.idToken || '';
    const userKey: string = session?.user?.email || session?.sessionId || 'anonymous';

    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'Not connected to Vincere' }, { status: 401 });
    }

    const payload = await req.json();

    // Basic validation (as per Vincere docs)
    if (!payload?.file_name) {
      return NextResponse.json({ ok: false, error: 'file_name is required' }, { status: 400 });
    }
    if (!payload?.url && !payload?.base_64_content) {
      return NextResponse.json({ ok: false, error: 'Provide url or base_64_content' }, { status: 400 });
    }

    const body = {
      document_type_id: payload.document_type_id ?? 1,
      original_cv: !!payload.original_cv,
      expiry_date: payload.expiry_date ?? undefined,
      creator_id: payload.creator_id ?? undefined,
      file_name: payload.file_name,
      url: payload.url ?? '',
      base_64_content: payload.base_64_content ?? '',
    };

    const url = `${API_BASE}/candidate/${encodeURIComponent(params.id)}/file`;

    // Attempt once with current token
    let res = await postOnce(url, idToken, body);

    // On auth failure, refresh like the other routes, re-read session, and retry once
    if (res.status === 401 || res.status === 403) {
      try {
        await refreshIdToken(userKey);
        const s2: any = await getSession();
        const id2: string = s2?.tokens?.idToken || '';
        if (id2) {
          res = await postOnce(url, id2, body);
        }
      } catch {
        // fall through and report the original response error
      }
    }

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, error: text || 'Upload failed' },
        { status: res.status }
      );
    }

    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unexpected error' }, { status: 500 });
  }
}

// app/api/vincere/candidate/[id]/customfields/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

type RouteCtx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  requiredEnv(['VINCERE_API_BASE']); // keep in step with your other Vincere routes
  const session = await getSession();

  if (!session?.vincere?.idToken) {
    return NextResponse.json({ ok: false, error: 'Not connected to Vincere' }, { status: 401 });
  }

  const id = params?.id?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing candidate id' }, { status: 400 });
  }

  // ensure token is fresh (same pattern as your other vincere endpoints)
  const idToken = await refreshIdToken(session).catch(() => session.vincere.idToken);

  const url = `${config.vincere.apiBase}/candidate/${encodeURIComponent(id)}/customfields`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // IMPORTANT: Vincere can be picky with caches via Vercel
      cache: 'no-store',
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : null;

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, error: JSON.stringify(json ?? text) },
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

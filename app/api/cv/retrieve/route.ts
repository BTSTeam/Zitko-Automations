// app/api/cv/retrieve/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

// Build the base URL from VINCERE_TENANT_API_BASE
const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');

async function fetchWithAutoRefresh(
  url: string,
  idToken: string,
  userKey: string,
) {
  // Set headers expected by Vincere
  const headers = new Headers();
  headers.set('id-token', idToken);
  headers.set(
    'x-api-key',
    (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
  );
  headers.set('accept', 'application/json');

  const doFetch = (h: Headers) =>
    fetch(url, { method: 'GET', headers: h, cache: 'no-store' });

  let resp = await doFetch(headers);

  // If the token is expired/invalid, refresh once and retry
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
      /* ignore refresh errors and fall through */
    }
  }

  return resp;
}

// Trim long error messages for client
function safeError(s: string) {
  return s.length > 800 ? s.slice(0, 800) + '…' : s;
}

export async function POST(req: NextRequest) {
  try {
    requiredEnv();

    const { candidateId } = (await req.json()) as { candidateId?: string | number };
    const idRaw = String(candidateId ?? '').replace(/[^\d]/g, '').trim();
    if (!idRaw) {
      return NextResponse.json(
        { ok: false, error: 'candidateId is required' },
        { status: 400 },
      );
    }

    const session: any = await getSession();
    const idToken = session.tokens?.idToken || '';
    const userKey = session.user?.email || session.sessionId || 'anonymous';

    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: 'Not connected to Vincere' },
        { status: 401 },
      );
    }

    // ---------- 1) Core candidate ----------
    const candUrl = `${BASE}/api/v2/candidate/${encodeURIComponent(idRaw)}`;
    let res = await fetchWithAutoRefresh(candUrl, idToken, userKey);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, status: res.status, error: safeError(text) },
        { status: res.status },
      );
    }
    const candidate = await res.json();

    // ---------- 2) Education, Work, CustomFields (parallel) ----------
    const eduUrl = `${BASE}/api/v2/candidate/${encodeURIComponent(idRaw)}/educationdetails`;
    const workUrl = `${BASE}/api/v2/candidate/${encodeURIComponent(idRaw)}/workexperiences`;
    const customUrl = `${BASE}/api/v2/candidate/${encodeURIComponent(idRaw)}/customfields`;

    const [eduRes, workRes, customRes] = await Promise.all([
      fetchWithAutoRefresh(eduUrl, idToken, userKey),
      fetchWithAutoRefresh(workUrl, idToken, userKey),
      fetchWithAutoRefresh(customUrl, idToken, userKey),
    ]);

    if (!eduRes.ok) {
      const text = await eduRes.text();
      return NextResponse.json(
        { ok: false, status: eduRes.status, error: safeError(text) },
        { status: eduRes.status },
      );
    }
    if (!workRes.ok) {
      const text = await workRes.text();
      return NextResponse.json(
        { ok: false, status: workRes.status, error: safeError(text) },
        { status: workRes.status },
      );
    }
    if (!customRes.ok) {
      const text = await customRes.text();
      return NextResponse.json(
        { ok: false, status: customRes.status, error: safeError(text) },
        { status: customRes.status },
      );
    }

    const [education, work, customfields] = await Promise.all([
      eduRes.json(),
      workRes.json(),
      customRes.json(),
    ]);

    // ---------- Normalise fields so the CV form can rely on consistent keys ----------
    const normalised = {
      id: candidate?.id ?? idRaw,
      name:
        [candidate?.firstName, candidate?.lastName].filter(Boolean).join(' ') ||
        candidate?.full_name ||
        '',
      current_title:
        candidate?.current_job_title || candidate?.job_title || '',
      location:
        candidate?.current_location_name ||
        candidate?.current_city ||
        candidate?.town_city ||
        '',
      linkedin: candidate?.linkedin ?? null,
      emails: candidate?.emails ?? [],
      phones: candidate?.phones ?? [],
      skills: candidate?.skill || candidate?.keywords || candidate?.skills || [],
      profile: candidate?.summary || candidate?.profile || '',
      education: Array.isArray(education?.data)
        ? education.data.map((e: any) => ({
            degree: e?.degree || e?.qualification || '',
            course: e?.course || '',
            institution: e?.institution || e?.school || '',
            start: e?.start_date || e?.from_date || '',
            end: e?.end_date || e?.to_date || '',
            description: e?.description || '',
          }))
        : [],
      work: Array.isArray(work?.data)
        ? work.data.map((w: any) => ({
            title: w?.title || w?.job_title || '',
            company: w?.company || w?.company_name || w?.employer || '',
            start: w?.start_date || w?.from_date || w?.work_from || '',
            end: w?.end_date || w?.to_date || w?.work_to || '',
            description: w?.description || '',
          }))
        : [],
      // NOTE: not mapping customfields into Additional Information yet;
      // returning raw below so you can specify mapping later.
    };

    return NextResponse.json({
      ok: true,
      candidate: normalised,
      raw: { candidate, education, work, customfields }, // <-- includes customfields
    });
  } catch (err: any) {
    const code = typeof err?.status === 'number' ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unexpected server error' },
      { status: code },
    );
  }
}

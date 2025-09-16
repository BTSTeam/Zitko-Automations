// app/api/cv/retrieve/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { refreshIdToken } from '@/lib/vincereRefresh';
import { config, requiredEnv } from '@/lib/config';

type VincereError = {
  message?: string;
  status?: string;
  httpStatus?: string | number;
  errorCode?: string;
  errorId?: string;
  errors?: string[];
};

type RetrieveReq = {
  candidateId?: string | number;
};

function json(res: any, status = 200) {
  return NextResponse.json(res, { status });
}

// Helper: ensure env ready
function ensureEnv() {
  requiredEnv([
    'VINCERE_CLIENT_ID',
    'VINCERE_API_KEY',
    'VINCERE_TENANT', // e.g. zitko.vincere.io
  ]);
}

// Helper: build full Vincere URL
function vUrl(path: string) {
  // config.vincereBase should look like https://{tenant}/api/v2
  const base = config.vincereBase?.replace(/\/$/, '');
  return `${base}${path}`;
}

// Helper: safe fetch with auth + json parsing + better errors
async function vGet<T>(path: string, token: string): Promise<T> {
  const url = vUrl(path);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-api-key': process.env.VINCERE_API_KEY as string,
    },
    // Avoid caching any CV data
    cache: 'no-store',
  });

  if (!res.ok) {
    let details: VincereError | undefined;
    try {
      details = (await res.json()) as VincereError;
    } catch {
      // ignore JSON parse issues
    }

    // Normalize some common cases for the UI
    if (res.status === 401) {
      throw Object.assign(new Error('Unauthorized'), {
        code: 401,
        details,
      });
    }
    if (res.status === 404) {
      const msg =
        details?.message ||
        (Array.isArray(details?.errors) ? details?.errors?.[0] : '') ||
        'Resource not found';
      throw Object.assign(new Error(msg), {
        code: 404,
        details,
      });
    }

    throw Object.assign(
      new Error(details?.message || `Vincere error ${res.status}`),
      { code: res.status, details }
    );
  }

  return (await res.json()) as T;
}

export async function POST(req: NextRequest) {
  try {
    ensureEnv();

    const session = await getSession();
    // Try to refresh/ensure token
    await refreshIdToken(session);

    const token = session?.vincere?.access_token || session?.vincere?.id_token;
    if (!token) {
      return json({ ok: false, error: 'Not connected to Vincere' }, 401);
    }

    const body = (await req.json()) as RetrieveReq;
    let idRaw = String(body?.candidateId ?? '').trim();
    if (!idRaw) {
      return json({ ok: false, error: 'candidateId is required' }, 400);
    }
    // Defensive: strip non-digits if the UI pasted with whitespace/new lines
    const id = idRaw.replace(/[^\d]/g, '');
    if (!id) {
      return json({ ok: false, error: 'candidateId is invalid' }, 400);
    }

    // Core profile
    const candidate = await vGet<any>(`/candidate/${id}`, token);

    // Extras: education + work
    const [education, work] = await Promise.all([
      vGet<any>(`/candidate/${id}/educationdetails`, token),
      vGet<any>(`/candidate/${id}/workexperience`, token),
    ]);

    // Optional: normalize for your CV UI (light touch; keep raw too)
    const normalized = {
      id: candidate?.id ?? id,
      name: [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' ') || '',
      current_title: candidate?.current_job_title ?? '',
      location: candidate?.current_location_name ?? candidate?.current_city ?? '',
      linkedin: candidate?.linkedin ?? null,
      emails: candidate?.emails ?? [],
      phones: candidate?.phones ?? [],
      skills: candidate?.skill ?? candidate?.keywords ?? [],
      // Flatten education/work into friendly arrays (best-effort)
      education: Array.isArray(education)
        ? education.map((e: any) => ({
            degree: e?.degree || e?.qualification || '',
            course: e?.course || '',
            institution: e?.institution || e?.school || '',
            start: e?.start_date || e?.from_date || '',
            end: e?.end_date || e?.to_date || '',
            description: e?.description || '',
          }))
        : [],
      work: Array.isArray(work)
        ? work.map((w: any) => ({
            title: w?.title || w?.job_title || '',
            company: w?.company || w?.employer || '',
            start: w?.start_date || w?.from_date || '',
            end: w?.end_date || w?.to_date || '',
            description: w?.description || '',
          }))
        : [],
    };

    return json({
      ok: true,
      candidate: normalized,
      raw: {
        candidate,
        education,
        work,
      },
    });
  } catch (err: any) {
    // Normalize unexpected errors
    const code = typeof err?.code === 'number' ? err.code : 500;
    const message =
      err?.message ||
      (typeof err === 'string' ? err : 'Unexpected server error');

    // Map some known Vincere messages to friendlier text
    const friendly =
      code === 404
        ? message.includes('No candidate is found')
          ? message
          : 'Candidate was not found in this Vincere tenant.'
        : code === 401
        ? 'Not connected to Vincere'
        : message;

    return json(
      {
        ok: false,
        status: code,
        error: friendly,
        debug: process.env.NODE_ENV !== 'production' ? err?.details || null : undefined,
      },
      code
    );
  }
}

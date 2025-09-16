// app/api/cv/retrieve/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { refreshIdToken } from '@/lib/vincereRefresh';
import { config } from '@/lib/config';

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

// Build base URL for Vincere v2
function getVincereBase(): string {
  // Prefer whatever your config exposes; fallback to env tenant
  const fromConfig = (config as any)?.vincereBase as string | undefined;
  if (fromConfig) return fromConfig.replace(/\/$/, '');
  const tenant = process.env.VINCERE_TENANT; // e.g. zitko.vincere.io
  if (!tenant) throw new Error('Missing VINCERE_TENANT or config.vincereBase');
  return `https://${tenant.replace(/^https?:\/\//, '')}/api/v2`;
}

function vUrl(path: string) {
  return `${getVincereBase()}${path}`;
}

// Vincere GET with auth headers and good errors
async function vGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(vUrl(path), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-api-key': process.env.VINCERE_API_KEY || '',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let details: VincereError | undefined;
    try {
      details = (await res.json()) as VincereError;
    } catch {
      /* ignore */
    }

    if (res.status === 401) {
      throw Object.assign(new Error('Unauthorized'), { code: 401, details });
    }
    if (res.status === 404) {
      const msg =
        details?.message ||
        (Array.isArray(details?.errors) ? details.errors[0] : '') ||
        'Resource not found';
      throw Object.assign(new Error(msg), { code: 404, details });
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
    // Light sanity check (don’t use requiredEnv here)
    if (!process.env.VINCERE_API_KEY) {
      return json({ ok: false, error: 'Missing VINCERE_API_KEY' }, 500);
    }

    const session = await getSession();
    await refreshIdToken(session);

    const token =
      session?.vincere?.access_token || session?.vincere?.id_token || '';

    if (!token) {
      return json({ ok: false, error: 'Not connected to Vincere' }, 401);
    }

    const body = (await req.json()) as RetrieveReq;
    const idRaw = String(body?.candidateId ?? '').trim();
    if (!idRaw) return json({ ok: false, error: 'candidateId is required' }, 400);

    const id = idRaw.replace(/[^\d]/g, '');
    if (!id) return json({ ok: false, error: 'candidateId is invalid' }, 400);

    // Core profile
    const candidate = await vGet<any>(`/candidate/${id}`, token);

    // Education + Work (Vincere uses singular workexperience on v2)
    const [education, work] = await Promise.all([
      vGet<any>(`/candidate/${id}/educationdetails`, token),
      vGet<any>(`/candidate/${id}/workexperience`, token),
    ]);

    // Normalized shape (keep it minimal; raw is returned too)
    const normalized = {
      id: candidate?.id ?? id,
      name:
        [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' ') ||
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
      // Pass through profile/summary if present
      profile: candidate?.summary || candidate?.profile || '',
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
            company: w?.company || w?.company_name || w?.employer || '',
            start: w?.start_date || w?.from_date || w?.work_from || '',
            end: w?.end_date || w?.to_date || w?.work_to || '',
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
    const code = typeof err?.code === 'number' ? err.code : 500;
    const message =
      err?.message || (typeof err === 'string' ? err : 'Unexpected server error');

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
        debug:
          process.env.NODE_ENV !== 'production' ? err?.details || null : undefined,
      },
      code
    );
  }
}

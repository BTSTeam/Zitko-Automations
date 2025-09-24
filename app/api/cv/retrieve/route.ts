// app/api/cv/retrieve/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

// ================== Vincere base ==================
const BASE = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');

// ================== Token-aware fetch ==================
async function fetchWithAutoRefresh(
  url: string,
  idToken: string,
  userKey: string,
) {
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
      // ignore; fall through with original resp
    }
  }

  return resp;
}

function safeError(s: string) {
  return s.length > 800 ? s.slice(0, 800) + '…' : s;
}

// ================== Custom Field key decoding ==================
// Keys you provided for Additional Information
const CF_KEYS = {
  DRIVING_LICENSE: 'edd971dc2678f05b5757fe31f2c586a8',
  AVAILABILITY:    'a18b8e0d62e27548df904106cfde1584',
  HEALTH:          '25bf6829933a29172af40f977e9422bc',
  CRIMINAL:        '4a4fa5b084a6efee647f98041ccfbc65',
  FINANCIAL:       '0a8914a354a50d327453c0342effb2c8',
} as const;

// Enumerations you provided
const DRIVING_LICENSE_MAP: Record<number, string> = {
  1: 'Banned',
  2: 'Full UK – No Points',
  3: 'Full UK - Points',
  4: 'Full - Clean',
  5: 'International',
  6: 'No Driving License',
  7: 'Other',
};

const AVAILABILITY_MAP: Record<number, string> = {
  1: '1 Month',
  2: '1 Week',
  3: '12 Weeks',
  4: '2 Weeks',
  5: '3 Weeks',
  6: '4 Weeks',
  7: '6 Weeks',
  8: '8 Weeks',
  9: 'Flexible',
  10: 'Immediate',
};

// CHECK_BOX per your spec: 1 => "Good", else blank
const CHECKBOX_VALUE = (n?: number | null) => (n === 1 ? 'Good' : '');

function toFieldsArray(customfields: any): any[] {
  if (Array.isArray(customfields?.data)) return customfields.data;
  if (Array.isArray(customfields?.items)) return customfields.items;
  if (Array.isArray(customfields)) return customfields;
  return [];
}

function firstNumber(arr: any): number | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const n = Number(arr[0]);
  return Number.isFinite(n) ? n : undefined;
}

function buildAdditionalInfoFromKeys(customfields: any): {
  drivingLicense?: string;
  availability?: string;
  health?: string;
  criminalRecord?: string;
  financialHistory?: string;
} {
  const fields = toFieldsArray(customfields);
  if (!fields.length) return {};

  const byKey = new Map<string, any>();
  for (const f of fields) {
    const key = (f?.key ?? f?.name ?? f?.id ?? '').toString().trim();
    if (key) byKey.set(key, f);
  }

  // DRIVING LICENSE (COMBO_BOX)
  let drivingLicense = '';
  const dl = byKey.get(CF_KEYS.DRIVING_LICENSE);
  if (dl?.type === 'COMBO_BOX') {
    const code = firstNumber(dl.field_values ?? dl.field_value_ids);
    drivingLicense = code ? (DRIVING_LICENSE_MAP[code] ?? '') : '';
  }

  // AVAILABILITY (COMBO_BOX)
  let availability = '';
  const av = byKey.get(CF_KEYS.AVAILABILITY);
  if (av?.type === 'COMBO_BOX') {
    const code = firstNumber(av.field_values ?? av.field_value_ids);
    availability = code ? (AVAILABILITY_MAP[code] ?? '') : '';
  }

  // HEALTH (CHECK_BOX) -> 1 = Good
  let health = '';
  const h = byKey.get(CF_KEYS.HEALTH);
  if (h?.type === 'CHECK_BOX') {
    const code = firstNumber(h.field_values ?? h.field_value_ids);
    health = CHECKBOX_VALUE(code);
  }

  // CRIMINAL RECORD (CHECK_BOX) -> 1 = Good
  let criminalRecord = '';
  const cr = byKey.get(CF_KEYS.CRIMINAL);
  if (cr?.type === 'CHECK_BOX') {
    const code = firstNumber(cr.field_values ?? cr.field_value_ids);
    criminalRecord = CHECKBOX_VALUE(code);
  }

  // FINANCIAL HISTORY (CHECK_BOX) -> 1 = Good
  let financialHistory = '';
  const fh = byKey.get(CF_KEYS.FINANCIAL);
  if (fh?.type === 'CHECK_BOX') {
    const code = firstNumber(fh.field_values ?? fh.field_value_ids);
    financialHistory = CHECKBOX_VALUE(code);
  }

  return {
    drivingLicense: drivingLicense || undefined,
    availability: availability || undefined,
    health: health || undefined,
    criminalRecord: criminalRecord || undefined,
    financialHistory: financialHistory || undefined,
  };
}

/** Optional: append a free-text CF if you keep one labelled "Additional Information"/"Notes" etc. */
function extractFreeTextAdditionalInformation(customfields: any): string {
  const fields: any[] = toFieldsArray(customfields);
  if (!fields.length) return '';

  const labelMatches = [
    'Additional Information',
    'Additional Info',
    'Notes',
    'Free Text',
    'Extra Information',
  ].map((x) => x.toLowerCase());

  const keyMatches = [
    'additional_information',
    'additionalInformation',
    'additional_info',
    'notes',
    'free_text',
  ].map((x) => x.toLowerCase());

  // Try label match
  for (const f of fields) {
    const label = (f?.label ?? f?.name ?? '').toString().trim().toLowerCase();
    const value = f?.value ?? f?.text ?? f?.stringValue ?? '';
    if (label && labelMatches.includes(label) && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  // Try key match
  for (const f of fields) {
    const key = (f?.name ?? f?.id ?? '').toString().trim().toLowerCase();
    const value = f?.value ?? f?.text ?? f?.stringValue ?? '';
    if (key && keyMatches.includes(key) && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function joinNonEmpty(lines: (string | undefined)[], sep = '\n'): string {
  return lines.filter((x) => typeof x === 'string' && x.trim().length > 0) as string[]
    .join(sep)
    .trim();
}

// ================== Handler ==================
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

    // ---- 1) Core candidate ----
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

    // ---- 2) Education, Work, CustomFields (parallel) ----
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

    // ---- Normalised candidate (stable keys for UI) ----
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
    };

    // ---- Additional Information (key-based decode + optional free-text) ----
    const decoded = buildAdditionalInfoFromKeys(customfields);

    const structuredLines = [
      decoded.drivingLicense ? `Driving License: ${decoded.drivingLicense}` : undefined,
      decoded.availability   ? `Availability: ${decoded.availability}`     : undefined,
      decoded.health         ? `Health: ${decoded.health}`                 : undefined,
      decoded.criminalRecord ? `Criminal Record: ${decoded.criminalRecord}`: undefined,
      decoded.financialHistory ? `Financial History: ${decoded.financialHistory}` : undefined,
    ];

    const freeText = extractFreeTextAdditionalInformation(customfields); // optional
    const additionalInfo = joinNonEmpty(
      [...structuredLines, freeText ? `Notes: ${freeText}` : undefined],
      '\n'
    );

    // ---- Response ----
    return NextResponse.json({
      ok: true,
      candidate: normalised,
      additionalInfo,
      raw: { candidate, education, work, customfields }, // for Raw JSON panels
    });
  } catch (err: any) {
    const code = typeof err?.status === 'number' ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unexpected server error' },
      { status: code },
    );
  }
}

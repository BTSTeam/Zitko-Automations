// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { refreshApolloAccessToken } from '@/lib/apolloRefresh';

const APOLLO_URL = 'https://api.apollo.io/api/v1/mixed_people/search';

/** Forced seniorities (allowed by Apollo People Search) */
const FORCED_SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp'] as const;

/** CRM/ATS technologies to exclude (converted to lowercase_underscore UIDs) */
const CRM_TECH_NAMES = [
  'Vincere',
  'Bullhorn',
  'TrackerRMS',
  'PC Recruiter',
  'Catsone',
  'Zoho Recruit',
  'JobAdder',
  'Crelate',
  'Avionte',
];
const CRM_TECH_UIDS = CRM_TECH_NAMES.map(n =>
  n.trim().toLowerCase().replace(/\s+/g, '_'),
);

/** Helpers */
function toArray(v?: string[] | string): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean);
  return v.split(',').map(s => s.trim()).filter(Boolean);
}
function toPosInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function todayYMD(): string { return ymd(new Date()); }
function dateNDaysAgoYMD(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return ymd(d);
}

export async function POST(req: NextRequest) {
  let inBody: any = {};
  try { inBody = await req.json(); } catch { inBody = {}; }

  // Inputs from UI
  const locations = toArray(inBody.locations);                     // -> organization_locations[]
  const keywordChips = toArray(inBody.keywords);                   // -> q_keywords (single string)
  const employeeRangesIncoming = toArray(inBody.employeeRanges)    // -> organization_num_employees_ranges[]
    .map(r => r.replace(/\s+/g, ''));
  const jobTitleFilters = toArray(inBody.q_organization_job_titles); // -> q_organization_job_titles[]
  const activeJobsOnly = Boolean(inBody.activeJobsOnly);

  // employeesMin / employeesMax fallback if ranges array not supplied
  const minNum = inBody.employeesMin === '' || inBody.employeesMin == null ? null : Number(inBody.employeesMin);
  const maxNum = inBody.employeesMax === '' || inBody.employeesMax == null ? null : Number(inBody.employeesMax);
  const employeeRanges: string[] = [...employeeRangesIncoming];
  if (!employeeRanges.length && (typeof minNum === 'number' || typeof maxNum === 'number')) {
    const min = Number.isFinite(minNum) ? String(minNum) : '';
    const max = Number.isFinite(maxNum) ? String(maxNum) : '';
    const range = [min, max].filter(Boolean).join(',');
    if (range) employeeRanges.push(range);
  }

  // Build q_keywords (single space-joined string)
  const q_keywords = keywordChips.length ? keywordChips.join(' ').trim() : '';

  const page = toPosInt(inBody.page, 1);
  const per_page = Math.min(25, toPosInt(inBody.per_page, 25));

  // Optional job postings date window, only if provided
  const rawDays = inBody.activeJobsDays;
  const jobsWindowDays =
    Number.isFinite(Number(rawDays)) && Number(raways) > 0
      ? Math.floor(Number(raways))
      : null;

  // Auth: OAuth (preferred) or API key
  const session = await getSession();
  const userKey = session.user?.email || session.sessionId || '';
  let accessToken: string | undefined = session.tokens?.apolloAccessToken || undefined;
  const apiKey: string | undefined = process.env.APOLLO_API_KEY || undefined;
  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: 'Not authenticated: no Apollo OAuth token or APOLLO_API_KEY present' },
      { status: 401 },
    );
  }
  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    else if (apiKey) h['X-Api-Key'] = apiKey;
    return h;
  };

  // Build query params
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(per_page));
  params.set('include_similar_titles', 'true');

  // Locations (company)
  locations.forEach(l => params.append('organization_locations[]', l));

  // Employees
  employeeRanges.forEach(r => params.append('organization_num_employees_ranges[]', r));

  // Seniorities
  FORCED_SENIORITIES.forEach(s => params.append('person_seniorities[]', s));

  // Company job titles filter
  jobTitleFilters.forEach(t => params.append('q_organization_job_titles[]', t));

  // q_keywords (single string) – URLSearchParams will encode spaces as %20
  if (q_keywords) params.set('q_keywords', q_keywords);

  // Company tech stack exclusions (lowercase_underscore UIDs)
  CRM_TECH_UIDS.forEach(uid =>
    params.append('currently_not_using_any_of_technology_uids[]', uid),
  );

  // Active jobs behavior (KEEP min=1 & max=100). Only apply posted_at range if provided.
  if (activeJobsOnly) {
    params.append('organization_num_jobs_range[min]', '1');
    params.append('organization_num_jobs_range[max]', '100');
    if (jobsWindowDays != null) {
      params.append('organization_job_posted_at_range[min]', dateNDaysAgoYMD(jobsWindowDays));
      params.append('organization_job_posted_at_range[max]', todayYMD());
    }
  }

  const urlWithQs = `${APOLLO_URL}?${params.toString()}`;
  const call = (headers: Record<string, string>) =>
    fetch(urlWithQs, { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-store' });

  try {
    let resp = await call(buildHeaders());

    // Refresh OAuth token if needed
    if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey);
      if (refreshed) {
        const s2 = await getSession();
        accessToken = s2.tokens?.apolloAccessToken;
        resp = await call(buildHeaders());
      }
    }

    const raw = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Apollo error: ${resp.status} ${resp.statusText}`, details: raw?.slice(0, 2000) },
        { status: resp.status || 400 },
      );
    }

    // Safe parse
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { data = {}; }
    }

    // Prefer contacts; some tenants return "people"
    const arr: any[] = Array.isArray(data?.contacts)
      ? data.contacts
      : Array.isArray(data?.people)
      ? data.people
      : [];

    const people = arr.map((p: any) => {
      const first = (p?.first_name ?? '').toString().trim();
      const last = (p?.last_name ?? '').toString().trim();
      const name =
        (p?.name && String(p.name).trim()) ||
        [first, last].filter(Boolean).join(' ').trim() ||
        null;

      const title =
        (p?.title && String(p.title).trim()) ||
        (Array.isArray(p?.employment_history) && p.employment_history[0]?.title) ||
        null;

      const organization_name =
        (Array.isArray(p?.employment_history) && p.employment_history[0]?.organization_name) ||
        (p?.organization?.name && String(p.organization.name).trim()) ||
        null;

      const formatted_address =
        (typeof p?.formatted_address === 'string' && p.formatted_address.trim()) ||
        (typeof p?.present_raw_address === 'string' && p.present_raw_address.trim()) ||
        ((p?.location?.name ?? [p?.city, p?.state, p?.country].filter(Boolean).join(', ')) || null);

      const headline =
        (typeof p?.headline === 'string' && p.headline.trim()) || null;

      const linkedin_url =
        typeof p?.linkedin_url === 'string' && p.linkedin_url ? p.linkedin_url : null;

      const facebook_url =
        typeof p?.facebook_url === 'string' && p.facebook_url ? p.facebook_url : null;

      const autoScore =
        typeof p?.people_auto_score === 'number'
          ? p.people_auto_score
          : typeof p?.auto_score === 'number'
          ? p.auto_score
          : null;

      return {
        id: p?.id ?? '',
        name,
        title: title ? String(title).trim() : null,
        organization_name: organization_name ? String(organization_name).trim() : null,
        formatted_address,
        headline,
        linkedin_url,
        facebook_url,
        autoScore,
      };
    });

    people.sort(
      (a: any, b: any) =>
        (b.autoScore ?? 0) - (a.autoScore ?? 0) ||
        String(a.name ?? '').localeCompare(String(b.name ?? '')),
    );

    return NextResponse.json({
      meta: { page, per_page, count: people.length },
      breadcrumbs: data?.breadcrumbs ?? [],
      pagination: data?.pagination ?? { page, per_page },
      people,
      apollo: data,
      apollo_pretty: JSON.stringify(data, null, 2),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error during Apollo request', details: String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/company-search with a JSON body.' },
    { status: 405 },
  );
}

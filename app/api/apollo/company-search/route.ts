// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { refreshApolloAccessToken } from '@/lib/apolloRefresh';

const APOLLO_PEOPLE_SEARCH_URL  = 'https://api.apollo.io/api/v1/mixed_people/search';
const APOLLO_NEWS_SEARCH_URL    = 'https://api.apollo.io/api/v1/news_articles/search';
const APOLLO_ORG_GET_URL        = (id: string) => `https://api.apollo.io/api/v1/organizations/${encodeURIComponent(id)}`;
const APOLLO_ORG_JOBS_URL       = (id: string) =>
  `https://api.apollo.io/api/v1/organizations/${encodeURIComponent(id)}/job_postings?page=1&per_page=10`;

/* -------------------------------- utils -------------------------------- */

function toArray(v?: string[] | string): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean);
  return v.split(',').map(s => s.trim()).filter(Boolean);
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function todayYMD(): string { return ymd(new Date()); }
function dateNDaysAgoYMD(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return ymd(d);
}

/* ----------------------- fixed filters & constants ---------------------- */

const FORCED_SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp'] as const;

const RECRUITER_CRM_TECH_NAMES: string[] = [
  'Vincere','Bullhorn','TrackerRMS','PC Recruiter','Catsone','Zoho Recruit','JobAdder','Crelate','Avionte',
];
const RECRUITER_CRM_TECH_UIDS = RECRUITER_CRM_TECH_NAMES.map(n => n.replace(/\s+/g, '_'));

const HIRING_TITLES = [
  'Head of Recruitment','Hiring Manager','Talent Acquisition','Talent Acquisition Manager',
  'Talent Acquisition Lead','Recruitment Manager','Recruiting Manager','Head of Talent',
  'Head of People','People & Talent','Talent Partner','Senior Talent Partner','Recruitment Partner',
];

/* --------------------------- header fallbacks --------------------------- */

type HeaderKind = 'search' | 'news' | 'jobs' | 'org';
type HeaderVariant =
  | { mode: 'oauth_bearer'; headers: Record<string,string>; usesToken: true  }
  | { mode: 'api_bearer';  headers: Record<string,string>; usesToken: false }
  | { mode: 'api_xkey';    headers: Record<string,string>; usesToken: false }
  | { mode: 'api_both';    headers: Record<string,string>; usesToken: false };

// Build a list of header variants we will try in order
function headerVariants(opts: {
  accessToken?: string | null | undefined;
  apiKey?: string | null | undefined;
  kind: HeaderKind;
}): HeaderVariant[] {
  const base = {
    accept: 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
  } as const;

  const variants: HeaderVariant[] = [];

  // 1) OAuth Bearer (if we have it)
  if (opts.accessToken) {
    variants.push({
      mode: 'oauth_bearer',
      headers: { ...base, Authorization: `Bearer ${opts.accessToken}` },
      usesToken: true,
    });
  }

  // 2) API Key variants (if we have an API key)
  if (opts.apiKey) {
    // Most consistent for /search & /news is Bearer <apiKey>
    variants.push({
      mode: 'api_bearer',
      headers: { ...base, Authorization: `Bearer ${opts.apiKey}` },
      usesToken: false,
    });

    // Some tenants accept X-Api-Key alone
    variants.push({
      mode: 'api_xkey',
      headers: { ...base, 'X-Api-Key': String(opts.apiKey) },
      usesToken: false,
    });

    // Some accept both
    variants.push({
      mode: 'api_both',
      headers: { ...base, Authorization: `Bearer ${opts.apiKey}`, 'X-Api-Key': String(opts.apiKey) },
      usesToken: false,
    });
  }

  // Special case: for jobs GET we often need X-Api-Key in addition to Bearer
  if (opts.kind === 'jobs' && opts.apiKey) {
    // Move the BOTH variant to the front for jobs
    const bothIdx = variants.findIndex(v => v.mode === 'api_both');
    if (bothIdx > 0) {
      const both = variants.splice(bothIdx, 1)[0];
      variants.unshift(both);
    }
  }

  return variants;
}

async function postJsonWithFallback(
  url: string,
  bodyObj: any,
  accessToken: string | undefined,
  apiKey: string | undefined,
  kind: HeaderKind,
  refreshKey: string | undefined,
  debug?: any
) {
  const variants = headerVariants({ accessToken, apiKey, kind });
  let lastText = '';
  let lastStatus = 0;
  let usedMode = '';

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const r = await fetch(url, {
      method: 'POST',
      headers: v.headers,
      body: JSON.stringify(bodyObj),
      cache: 'no-store',
    });
    lastStatus = r.status;
    const t = await r.text();
    lastText = t;
    if (r.ok) {
      if (debug) debug._last_header_mode_success = v.mode;
      return { ok: true, status: r.status, text: t };
    }

    // If OAuth token used and unauthorized, try one refresh then retry this variant once.
    if ((r.status === 401 || r.status === 403) && v.usesToken && accessToken && refreshKey) {
      const refreshed = await refreshApolloAccessToken(refreshKey);
      if (refreshed) {
        const s2 = await getSession();
        accessToken = s2.tokens?.apolloAccessToken;
        // retry with new token
        const retryVariant = headerVariants({ accessToken, apiKey, kind }).find(x => x.mode === 'oauth_bearer');
        if (retryVariant) {
          const rr = await fetch(url, {
            method: 'POST',
            headers: retryVariant.headers,
            body: JSON.stringify(bodyObj),
            cache: 'no-store',
          });
          const t2 = await rr.text();
          if (rr.ok) {
            if (debug) debug._last_header_mode_success = retryVariant.mode;
            return { ok: true, status: rr.status, text: t2 };
          }
          lastStatus = rr.status;
          lastText = t2;
        }
      }
    }
    usedMode = v.mode;
  }

  if (debug) debug._last_header_mode_failed = usedMode;
  return { ok: false, status: lastStatus, text: lastText };
}

async function getWithFallback(
  url: string,
  accessToken: string | undefined,
  apiKey: string | undefined,
  kind: HeaderKind,
  refreshKey: string | undefined,
  debug?: any
) {
  const variants = headerVariants({ accessToken, apiKey, kind });
  let lastText = '';
  let lastStatus = 0;
  let usedMode = '';

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const r = await fetch(url, { method: 'GET', headers: v.headers, cache: 'no-store' });
    lastStatus = r.status;
    const t = await r.text();
    lastText = t;
    if (r.ok) {
      if (debug) debug._last_header_mode_success = v.mode;
      return { ok: true, status: r.status, text: t };
    }

    if ((r.status === 401 || r.status === 403) && v.usesToken && accessToken && refreshKey) {
      const refreshed = await refreshApolloAccessToken(refreshKey);
      if (refreshed) {
        const s2 = await getSession();
        accessToken = s2.tokens?.apolloAccessToken;
        const retryVariant = headerVariants({ accessToken, apiKey, kind }).find(x => x.mode === 'oauth_bearer');
        if (retryVariant) {
          const rr = await fetch(url, { method: 'GET', headers: retryVariant.headers, cache: 'no-store' });
          const t2 = await rr.text();
          if (rr.ok) {
            if (debug) debug._last_header_mode_success = retryVariant.mode;
            return { ok: true, status: rr.status, text: t2 };
          }
          lastStatus = rr.status;
          lastText = t2;
        }
      }
    }
    usedMode = v.mode;
  }

  if (debug) debug._last_header_mode_failed = usedMode;
  return { ok: false, status: lastStatus, text: lastText };
}

/* -------------------------------- route -------------------------------- */

export async function POST(req: NextRequest) {
  const redactHeaders = (h: Record<string, string>) => {
    const c: Record<string, string> = { ...h };
    if (c.Authorization) c.Authorization = 'Bearer ***';
    if (c['X-Api-Key']) c['X-Api-Key'] = '***';
    return c;
  };

  let bodyEcho: any = {};
  try { bodyEcho = await req.clone().json(); } catch {}

  const DEBUG =
    (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true' ||
    (req.headers.get('x-debug-apollo') || '').trim() === '1' ||
    bodyEcho?.debug === true;

  const DISABLE_TECH_EXCLUSION =
    (process.env.APOLLO_DISABLE_ATS_EXCLUSION || '').toLowerCase() === 'true';
  const DISABLE_POSTED_AT =
    (process.env.APOLLO_DISABLE_POSTED_AT || '').toLowerCase() === 'true';
  const JOBS_HEADERS_KIND =
    ((process.env.APOLLO_JOBS_HEADERS_KIND || 'search') as 'search' | 'jobs');

  // -------- inputs
  let inBody: {
    locations?: string[] | string;                 // organization_locations[]
    keywords?: string[] | string;                  // -> q_keywords (space-joined)
    employeeRanges?: string[] | string;            // organization_num_employees_ranges[] "min,max"
    employeesMin?: number | string | null;
    employeesMax?: number | string | null;
    activeJobsOnly?: boolean;                      // if true -> org_num_jobs[min]=1 & [max]=100
    q_organization_job_titles?: string[] | string; // q_organization_job_titles[]
    activeJobsDays?: number | string | null;       // window for posted_at range
    page?: number | string;
    per_page?: number | string;
    debug?: boolean;
  } = {};
  try { inBody = (await req.json()) || {}; } catch {}

  const locations = toArray(inBody.locations);
  const keywordChips = toArray(inBody.keywords);
  const employeeRangesIncoming = toArray(inBody.employeeRanges).map(r => r.replace(/\s+/g, ''));
  const jobTitleFilters = toArray(inBody.q_organization_job_titles);
  const activeJobsOnly = Boolean(inBody.activeJobsOnly);

  const minNum = inBody.employeesMin === '' || inBody.employeesMin == null ? null : Number(inBody.employeesMin);
  const maxNum = inBody.employeesMax === '' || inBody.employeesMax == null ? null : Number(inBody.employeesMax);
  const employeeRanges: string[] = [...employeeRangesIncoming];
  if (!employeeRanges.length && (typeof minNum === 'number' || typeof maxNum === 'number')) {
    const min = Number.isFinite(minNum) ? String(minNum) : '';
    const max = Number.isFinite(maxNum) ? String(maxNum) : '';
    const range = [min, max].filter(Boolean).join(',');
    if (range) employeeRanges.push(range);
  }

  const q_keywords = keywordChips.length ? keywordChips.join(' ').trim() : '';

  const page = Math.max(1, parseInt(String(inBody.page ?? '1'), 10) || 1);
  const per_page = Math.max(1, Math.min(25, parseInt(String(inBody.per_page ?? '25'), 10) || 25));

  const rawDays = inBody.activeJobsDays;
  const jobsWindowDays =
    Number.isFinite(Number(rawDays)) && Number(rawDays) > 0 ? Math.floor(Number(rawDays)) : null;

  // -------- auth
  const session   = await getSession();
  const userKey   = session.user?.email || session.sessionId || '';
  let accessToken = session.tokens?.apolloAccessToken;
  const apiKey    = process.env.APOLLO_API_KEY;

  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: 'Not authenticated: missing Apollo OAuth token or APOLLO_API_KEY' },
      { status: 401 },
    );
  }

  /* ---------------- People Search (ORG-filtered) — POST JSON body ---------------- */

  const pplBody: Record<string, any> = {
    page,
    per_page,
    include_similar_titles: true,
  };

  if (locations.length) pplBody['organization_locations[]'] = locations;           // HQ filter
  if (employeeRanges.length) pplBody['organization_num_employees_ranges[]'] = employeeRanges;

  if (activeJobsOnly) {
    pplBody['organization_num_jobs_range[min]'] = 1;
    pplBody['organization_num_jobs_range[max]'] = 100;
    if (jobsWindowDays && !DISABLE_POSTED_AT) {
      pplBody['organization_job_posted_at_range[min]'] = dateNDaysAgoYMD(jobsWindowDays);
      pplBody['organization_job_posted_at_range[max]'] = todayYMD();
    }
  }

  if (jobTitleFilters.length) pplBody['q_organization_job_titles[]'] = jobTitleFilters;
  if (q_keywords) pplBody['q_keywords'] = q_keywords;
  pplBody['person_seniorities[]'] = FORCED_SENIORITIES;

  if (!DISABLE_TECH_EXCLUSION) {
    pplBody['currently_not_using_any_of_technology_uids[]'] = RECRUITER_CRM_TECH_UIDS;
  }

  const debugBag: any = DEBUG ? {
    inputBody: inBody,
    builtBody: pplBody,
  } : undefined;

  const pplResp = await postJsonWithFallback(
    APOLLO_PEOPLE_SEARCH_URL,
    pplBody,
    accessToken,
    apiKey,
    'search',
    userKey,
    debugBag
  );

  if (DEBUG && debugBag) {
    debugBag.apolloStatus      = pplResp.status;
    debugBag.apolloOk          = Boolean(pplResp.ok);
    debugBag.apolloBodyPreview = (pplResp.text || '').slice(0, 2000);
  }

  if (!pplResp.ok) {
    return NextResponse.json(
      {
        error: `Apollo people (company-proxy) search error: ${pplResp.status} ${pplResp.ok ? '' : ''}`.trim(),
        details: (pplResp.text || '').slice(0, 2000),
        debug: debugBag,
      },
      { status: pplResp.status || 400 },
    );
  }

  // ------------ Collect org IDs (robust for contacts/people shapes) ------------
  let peopleData: any = {};
  try { peopleData = pplResp.text ? JSON.parse(pplResp.text) : {}; } catch {}

  // Prefer contacts[] (as in your sample), else people[]
  const records: any[] = Array.isArray(peopleData?.contacts)
    ? peopleData.contacts
    : Array.isArray(peopleData?.people)
      ? peopleData.people
      : [];

  const orgIdSet = new Set<string>();
  for (const r of records) {
    const fromDirect = r?.organization_id ? String(r.organization_id) : '';
    const fromObj    = r?.organization?.id ? String(r.organization.id) : '';
    const fromHist   = Array.isArray(r?.employment_history) && r.employment_history[0]?.organization_id
      ? String(r.employment_history[0].organization_id)
      : '';
    const id = fromDirect || fromObj || fromHist || '';
    if (id) orgIdSet.add(id);
  }
  const orgIds = Array.from(orgIdSet);

  if (DEBUG && debugBag) {
    debugBag.parsed_people_count = records.length;
    debugBag.unique_org_ids = orgIds.length;
    debugBag.sample_person = records[0] ? {
      id: records[0].id,
      organization_id: records[0]?.organization_id ?? null,
      org_obj_id: records[0]?.organization?.id ?? null,
      emp_hist_org_id: Array.isArray(records[0]?.employment_history)
        ? records[0].employment_history?.[0]?.organization_id ?? null
        : null,
    } : null;
  }

  if (!orgIds.length) {
    return NextResponse.json({ companies: [], page, per_page, debug: debugBag });
  }

  /* ---------------- Enrich each organization ---------------- */

  const published_after = dateNDaysAgoYMD(90);

  const enriched = await Promise.all(
    orgIds.map(async (orgId) => {
      const base: any = {
        id: orgId,
        name: null as string | null,
        website_url: null as string | null,
        linkedin_url: null as string | null,
        exact_location: null as string | null,
        city: null as string | null,
        state: null as string | null,
        short_description: null as string | null,
        job_postings: [] as any[],
        hiring_people: [] as any[],
        news_articles: [] as any[],
      };

      // Org details
      const orgR = await getWithFallback(
        APOLLO_ORG_GET_URL(orgId),
        accessToken,
        apiKey,
        'org',
        userKey
      );

      if (orgR.ok) {
        try {
          const org = JSON.parse(orgR.text || '{}')?.organization || {};
          base.name              = org?.name ?? null;
          base.website_url       = org?.website_url ?? org?.domain ?? null;
          base.linkedin_url      = org?.linkedin_url ?? null;
          base.city              = org?.city ?? null;
          base.state             = org?.state ?? null;
          base.short_description = org?.short_description ?? null;
          base.exact_location    = base.exact_location || [base.city, base.state].filter(Boolean).join(', ') || null;
        } catch {}
      }

      // Job postings (favor both headers for tenants that require it)
      const jobsR = await getWithFallback(
        APOLLO_ORG_JOBS_URL(orgId),
        accessToken,
        apiKey,
        'jobs',
        userKey
      );

      if (jobsR.ok) {
        try {
          const jobs = JSON.parse(jobsR.text || '{}');
          base.job_postings = Array.isArray(jobs?.job_postings) ? jobs.job_postings : [];
        } catch { base.job_postings = []; }
      } else if (jobsR.status) {
        (base as any).job_postings_error = {
          status: jobsR.status,
          body: (jobsR.text || '').slice(0, 500),
        };
      }

      // Hiring people (POST)
      const hiringR = await postJsonWithFallback(
        APOLLO_PEOPLE_SEARCH_URL,
        {
          'organization_ids[]': [orgId],
          'person_titles[]': HIRING_TITLES,
          include_similar_titles: true,
          per_page: 10,
        },
        accessToken,
        apiKey,
        'search',
        userKey
      );
      if (hiringR.ok) {
        try {
          const hp = JSON.parse(hiringR.text || '{}');
          base.hiring_people =
            Array.isArray(hp?.contacts) ? hp.contacts :
            Array.isArray(hp?.people)   ? hp.people   : [];
        } catch { base.hiring_people = []; }
      }

      // News (POST)
      const newsR = await postJsonWithFallback(
        APOLLO_NEWS_SEARCH_URL,
        { 'organization_ids[]': [orgId], published_after, per_page: 2 },
        accessToken,
        apiKey,
        'news',
        userKey
      );
      if (newsR.ok) {
        try {
          const news = JSON.parse(newsR.text || '{}');
          base.news_articles = Array.isArray(news?.news_articles) ? news.news_articles : [];
        } catch { base.news_articles = []; }
      }

      return base;
    }),
  );

  return NextResponse.json({
    companies: enriched,
    page,
    per_page,
    debug: DEBUG ? { ...debugBag } : undefined,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/company-search with a JSON body.' },
    { status: 405 },
  );
}

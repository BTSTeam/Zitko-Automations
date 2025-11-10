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

// Decision-makers
const FORCED_SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp'] as const;

// Recruiter CRMs (kept)
const RECRUITER_CRM_TECH_NAMES: string[] = [
  'Vincere','Bullhorn','TrackerRMS','PC Recruiter','Catsone','Zoho Recruit','JobAdder','Crelate','Avionte'
];
const RECRUITER_CRM_TECH_UIDS = RECRUITER_CRM_TECH_NAMES.map(n => n.replace(/\s+/g, '_'));

const HIRING_TITLES = [
  'Head of Recruitment','Hiring Manager','Talent Acquisition','Talent Acquisition Manager',
  'Talent Acquisition Lead','Recruitment Manager','Recruiting Manager','Head of Talent',
  'Head of People','People & Talent','Talent Partner','Senior Talent Partner','Recruitment Partner',
];

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

  // Inputs
  let inBody: {
    locations?: string[] | string;
    keywords?: string[] | string;
    employeeRanges?: string[] | string;
    employeesMin?: number | string | null;
    employeesMax?: number | string | null;
    activeJobsOnly?: boolean;
    q_organization_job_titles?: string[] | string;
    activeJobsDays?: number | string | null;
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

  // Auth
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

  // Match the working people-search route:
  const buildHeaders = (kind: 'search' | 'jobs' = 'search'): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      h.Authorization = `Bearer ${accessToken}`;
    } else if (apiKey) {
      // /search and /news accept Authorization: Bearer <apiKey>
      h.Authorization = `Bearer ${apiKey}`;
      // Some tenants require X-Api-Key for jobs GET only
      if (kind === 'jobs') h['X-Api-Key'] = apiKey;
    }
    return h;
  };

  const postWithRetry = async (url: string, bodyObj: any, kind: 'search' | 'jobs' = 'search') => {
    const call = (headers: Record<string, string>) =>
      fetch(url, { method: 'POST', headers, body: JSON.stringify(bodyObj), cache: 'no-store' });

    let resp = await call(buildHeaders(kind));
    if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey);
      if (refreshed) {
        const s2 = await getSession();
        accessToken = s2.tokens?.apolloAccessToken;
        resp = await call(buildHeaders(kind));
      }
    }
    return resp;
  };

  // People Search body (ORG-level filters)
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

  // Decision-maker bias
  pplBody['person_seniorities[]'] = FORCED_SENIORITIES;

  // Exclude obvious recruitment agencies (recruiter CRMs only)
  if (!DISABLE_TECH_EXCLUSION) {
    pplBody['currently_not_using_any_of_technology_uids[]'] = RECRUITER_CRM_TECH_UIDS;
  }

  const debugBag: any = DEBUG ? {
    inputBody: inBody,
    builtBody: pplBody,
    headers: redactHeaders(buildHeaders('search')),
  } : undefined;

  const pplResp = await postWithRetry(APOLLO_PEOPLE_SEARCH_URL, pplBody, 'search');
  const pplRaw  = await pplResp.text();

  if (DEBUG && debugBag) {
    debugBag.apolloStatus      = pplResp.status;
    debugBag.apolloOk          = pplResp.ok;
    debugBag.apolloBodyPreview = (pplRaw || '').slice(0, 2000);
  }

  if (!pplResp.ok) {
    return NextResponse.json(
      {
        error: `Apollo people (company-proxy) search error: ${pplResp.status} ${pplResp.statusText}`,
        details: (pplRaw || '').slice(0, 2000),
        debug: debugBag,
      },
      { status: pplResp.status || 400 },
    );
  }

  // --- Parse and collect unique org IDs (robust for contacts/people shapes)
  let peopleData: any = {};
  try { peopleData = pplRaw ? JSON.parse(pplRaw) : {}; } catch {}

  // Prefer contacts[] (as in your example), else people[]
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

  // --- Enrich each organization
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

      const orgHeaders  = buildHeaders('search');
      const jobsHeaders = buildHeaders(JOBS_HEADERS_KIND);

      // Hiring people panel (POST)
      const hiringBody = {
        'organization_ids[]': [orgId],
        'person_titles[]': HIRING_TITLES,
        include_similar_titles: true,
        per_page: 10,
      };

      // News (POST)
      const newsBody = {
        'organization_ids[]': [orgId],
        published_after,
        per_page: 2,
      };

      const [orgR, jobsR, hiringR, newsR] = await Promise.allSettled([
        // Org details (GET)
        fetch(APOLLO_ORG_GET_URL(orgId), {
          method: 'GET',
          headers: orgHeaders,
          cache: 'no-store',
        }).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // Job postings (GET)
        fetch(APOLLO_ORG_JOBS_URL(orgId), {
          method: 'GET',
          headers: jobsHeaders,
          cache: 'no-store',
        }).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // Hiring people (POST)
        postWithRetry(APOLLO_PEOPLE_SEARCH_URL, hiringBody, 'search')
          .then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // News (POST)
        postWithRetry(APOLLO_NEWS_SEARCH_URL, newsBody, 'search')
          .then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),
      ]);

      // Org details
      if (orgR.status === 'fulfilled' && orgR.value.ok) {
        try {
          const org = JSON.parse(orgR.value.body || '{}')?.organization || {};
          base.name              = org?.name ?? null;
          base.website_url       = org?.website_url ?? org?.domain ?? null;
          base.linkedin_url      = org?.linkedin_url ?? null;
          base.city              = org?.city ?? null;
          base.state             = org?.state ?? null;
          base.short_description = org?.short_description ?? null;
          base.exact_location    = base.exact_location || [base.city, base.state].filter(Boolean).join(', ') || null;
        } catch {}
      }

      // Job postings
      if (jobsR.status === 'fulfilled') {
        if (jobsR.value.ok) {
          try {
            const jobs = JSON.parse(jobsR.value.body || '{}');
            base.job_postings = Array.isArray(jobs?.job_postings) ? jobs.job_postings : [];
          } catch { base.job_postings = []; }
        } else {
          base.job_postings = [];
          (base as any).job_postings_error = {
            status: jobsR.value.status,
            body: (jobsR.value.body || '').slice(0, 500),
          };
        }
      }

      // Hiring people
      if (hiringR.status === 'fulfilled' && hiringR.value.ok) {
        try {
          const hp = JSON.parse(hiringR.value.body || '{}');
          base.hiring_people =
            Array.isArray(hp?.contacts) ? hp.contacts :
            Array.isArray(hp?.people)   ? hp.people   : [];
        } catch { base.hiring_people = []; }
      }

      // News
      if (newsR.status === 'fulfilled' && newsR.value.ok) {
        try {
          const news = JSON.parse(newsR.value.body || '{}');
          base.news_articles = Array.isArray(news?.news_articles) ? news.news_articles : [];
        } catch { base.news_articles = []; }
      }

      if (DEBUG) {
        (base as any)._debug = {
          details_url: APOLLO_ORG_GET_URL(orgId),
          jobs_url:    APOLLO_ORG_JOBS_URL(orgId),
          hiring_body: hiringBody,
          news_body:   newsBody,
        };
      }

      return base;
    }),
  );

  return NextResponse.json({
    companies: enriched,
    page,
    per_page,
    debug: debugBag,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/company-search with a JSON body.' },
    { status: 405 },
  );
}

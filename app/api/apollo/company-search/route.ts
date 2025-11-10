// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { refreshApolloAccessToken } from '@/lib/apolloRefresh';

/**
 * This route intentionally uses the People Search endpoint (mixed_people/search)
 * with ORGANIZATION-LEVEL filters to proxy a "company search".
 * It then enriches each discovered org via:
 *  - GET /organizations/{id}
 *  - GET /organizations/{id}/job_postings?page=1&per_page=10
 *  - POST /news_articles/search (last 90 days, per_page=2)
 *  - POST /mixed_people/search for internal hiring roles
 */

const APOLLO_PEOPLE_SEARCH_URL  = 'https://api.apollo.io/api/v1/mixed_people/search';
const APOLLO_NEWS_SEARCH_URL    = 'https://api.apollo.io/api/v1/news_articles/search';
const APOLLO_ORG_GET_URL        = (id: string) => `https://api.apollo.io/api/v1/organizations/${encodeURIComponent(id)}`;
const APOLLO_ORG_JOBS_URL       = (id: string) =>
  `https://api.apollo.io/api/v1/organizations/${encodeURIComponent(id)}/job_postings?page=1&per_page=10`;

/* ------------------------------- utils -------------------------------- */

function toArray(v?: string[] | string): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean);
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

/** Build query string: arrays -> repeated keys, values safely encoded */
function buildQS(params: Record<string, string[] | string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const val of v) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`);
      }
    } else if (v !== undefined && v !== null && String(v).length) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join('&');
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function todayYMD(): string { return ymd(new Date()); }
function dateNDaysAgoYMD(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return ymd(d);
}

/* ---------------------------- hard-coded filters ---------------------------- */

/** Required seniorities to include (lowercase per Apollo snake_case) */
const FORCED_SENIORITIES = ['owner','founder','c_suite','partner','vp'];

/** Exclude recruitment tech (spaces -> underscores for *_uids) */
const ATS_TECH_NAMES: string[] = [
  'AcquireTM','ADP Applicant Tracking System','Applicant Pro','Ascendify','ATS OnDemand','Avature','Avionte','BambooHR',
  'Bond Adapt','Breezy HR (formerly NimbleHR)','Catsone','Compas (MyCompas)','Cornerstone On Demand','Crelate',
  'Employease','eRecruit','Findly','Gethired','Gild','Greenhouse.io','HealthcareSource','HireBridge','HR Logix','HRMDirect',
  'HRSmart','Hyrell','iCIMS','Infor (PeopleAnswers)','Interviewstream','JobAdder','JobApp','JobDiva','Jobscore','Jobvite',
  'Kenexa','Kwantek','Lever','Luceo','Lumesse','myStaffingPro','myTalentLink','Newton Software','PC Recruiter',
  'People Matter','PeopleFluent','Resumator','Sendouts','SilkRoad','SmartRecruiters','SmashFly','SuccessFactors (SAP)',
  'TalentEd','Taleo','TMP Worldwide','TrackerRMS','UltiPro','Umantis','Winocular','Workable','Workday Recruit',
  'ZipRecruiter','Zoho Recruit','Vincere','Bullhorn',
];
const ATS_TECH_UIDS = ATS_TECH_NAMES.map(n => n.replace(/\s+/g, '_'));

/** Titles for discovering hiring stakeholders per org */
const HIRING_TITLES = [
  'Head of Recruitment','Hiring Manager','Talent Acquisition','Talent Acquisition Manager',
  'Talent Acquisition Lead','Recruitment Manager','Recruiting Manager','Head of Talent',
  'Head of People','People & Talent','Talent Partner','Senior Talent Partner','Recruitment Partner',
];

/* --------------------------------- API --------------------------------- */

export async function POST(req: NextRequest) {
  // ---- debug helpers ----
  const redactHeaders = (h: Record<string, string>) => {
    const copy: Record<string, string> = { ...h };
    if (copy.Authorization) copy.Authorization = 'Bearer ***';
    if (copy['X-Api-Key']) copy['X-Api-Key'] = '***';
    return copy;
  };

  // Read body first for potential header-less debug
  let inBodyForDebug: any = {};
  try { inBodyForDebug = await req.clone().json(); } catch {}

  const DEBUG =
    (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true' ||
    (req.headers.get('x-debug-apollo') || '').trim() === '1' ||
    Boolean(inBodyForDebug?.debug === true);

  // Optional flags useful while troubleshooting tenant specifics
  const DISABLE_ATS       = (process.env.APOLLO_DISABLE_ATS_EXCLUSION || '').toLowerCase() === 'true';
  const DISABLE_POSTED_AT = (process.env.APOLLO_DISABLE_POSTED_AT || '').toLowerCase() === 'true';
  const JOBS_HEADERS_KIND = ((process.env.APOLLO_JOBS_HEADERS_KIND || 'search') as 'search' | 'jobs');

  // ---- input ----
  let inBody: {
    locations?: string[] | string;                    // organization_locations[]
    keywords?: string[] | string;                     // join -> q_keywords
    employeeRanges?: string[] | string;               // organization_num_employees_ranges[] (already normalized "min,max")
    employeesMin?: number | string | null;            // fallback to build single "min,max"
    employeesMax?: number | string | null;
    activeJobsOnly?: boolean;                         // adds org_num_jobs_range[min]=1 and [max]=100
    q_organization_job_titles?: string[] | string;    // q_organization_job_titles[]
    activeJobsDays?: number | string | null;          // window for posted_at range
    page?: number | string;
    per_page?: number | string;
    debug?: boolean;
  } = {};

  try {
    inBody = (await req.json()) || {};
  } catch {}

  // Normalize inputs
  const locations              = toArray(inBody.locations);
  const keywordChips           = toArray(inBody.keywords);
  const employeeRangesIncoming = toArray(inBody.employeeRanges).map(r => r.replace(/\s+/g, '')); // ensure "1,100"
  const jobTitleFilters        = toArray(inBody.q_organization_job_titles);
  const activeJobsOnly         = Boolean(inBody.activeJobsOnly);

  // If UI only provided min/max, convert into a single "min,max" entry
  const minNum = inBody.employeesMin === '' || inBody.employeesMin == null ? null : Number(inBody.employeesMin);
  const maxNum = inBody.employeesMax === '' || inBody.employeesMax == null ? null : Number(inBody.employeesMax);
  const employeeRanges: string[] = [...employeeRangesIncoming];
  if (!employeeRanges.length && (typeof minNum === 'number' || typeof maxNum === 'number')) {
    const min = Number.isFinite(minNum) ? String(minNum) : '';
    const max = Number.isFinite(maxNum) ? String(maxNum) : '';
    const range = [min, max].filter(x => x !== '').join(',');
    if (range) employeeRanges.push(range);
  }

  // Keywords -> single space-separated string (avoid commas)
  const q_keywords = keywordChips.length ? keywordChips.join(' ').trim() : '';

  const page     = Math.max(1, parseInt(String(inBody.page ?? '1'), 10) || 1);
  const per_page = Math.max(1, Math.min(25, parseInt(String(inBody.per_page ?? '25'), 10) || 25));

  const rawDays = inBody.activeJobsDays;
  const jobsWindowDays =
    Number.isFinite(Number(rawDays)) && Number(rawDays) > 0 ? Math.floor(Number(rawDays)) : null;

  // ---- auth ----
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

  // Headers: search POST = X-Api-Key or Bearer; jobs GET may require Bearer+X-Api-Key for some tenants
  const buildHeaders = (kind: 'search' | 'jobs' = 'search'): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      h.Authorization = `Bearer ${accessToken}`;
    } else if (apiKey) {
      if (kind === 'jobs') {
        h.Authorization = `Bearer ${apiKey}`;
        h['X-Api-Key'] = apiKey;
      } else {
        h['X-Api-Key'] = apiKey;
      }
    }
    return h;
  };

  // helper: POST with retry (for /search endpoints)
  const postWithRetry = async (url: string) => {
    const call = (headers: Record<string, string>) =>
      fetch(url, { method: 'POST', headers, body: JSON.stringify({}), cache: 'no-store' });

    let resp = await call(buildHeaders('search'));
    if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey);
      if (refreshed) {
        const s2 = await getSession();
        accessToken = s2.tokens?.apolloAccessToken;
        resp = await call(buildHeaders('search'));
      }
    }
    return resp;
  };

  /* ------------------------ Build company-proxy people search ------------------------ */

  const peopleQS: Record<string, string[] | string> = {
    page: String(page),
    per_page: String(per_page),
    include_similar_titles: 'true',
  };

  // Locations -> organization_locations[]
  locations.forEach((loc) => {
    peopleQS['organization_locations[]'] =
      (peopleQS['organization_locations[]'] as string[] | undefined)?.concat(loc) || [loc];
  });

  // Employees -> organization_num_employees_ranges[]
  if (employeeRanges.length) {
    peopleQS['organization_num_employees_ranges[]'] = employeeRanges;
  }

  // Active job listings -> organization_num_jobs_range[min]=1 and [max]=100 (+ posted_at window)
  if (activeJobsOnly) {
    peopleQS['organization_num_jobs_range[min]'] = '1';
    peopleQS['organization_num_jobs_range[max]'] = '100';
    if (jobsWindowDays && !DISABLE_POSTED_AT) {
      peopleQS['organization_job_posted_at_range[min]'] = dateNDaysAgoYMD(jobsWindowDays);
      peopleQS['organization_job_posted_at_range[max]'] = todayYMD();
    }
  }

  // Active job titles -> q_organization_job_titles[]
  if (jobTitleFilters.length) {
    peopleQS['q_organization_job_titles[]'] = jobTitleFilters;
  }

  // Keywords -> q_keywords
  if (q_keywords) {
    peopleQS['q_keywords'] = q_keywords;
  }

  // Force person_seniorities[]
  FORCED_SENIORITIES.forEach(s => {
    peopleQS['person_seniorities[]'] =
      (peopleQS['person_seniorities[]'] as string[] | undefined)?.concat(s) || [s];
  });

  // Exclude recruitment companies via currently_not_using_any_of_technology_uids[]
  if (!DISABLE_ATS) {
    peopleQS['currently_not_using_any_of_technology_uids[]'] = ATS_TECH_UIDS;
  }

  // ---- capture debug BEFORE the call
  const debugBag: any = DEBUG ? {
    inputBody: inBody,
    builtParams: peopleQS,
    finalUrl: `${APOLLO_PEOPLE_SEARCH_URL}?${buildQS(peopleQS)}`,
    headers: redactHeaders(buildHeaders('search')),
  } : undefined;

  // ---- perform call and keep raw response in debug
  const peopleSearchUrl = `${APOLLO_PEOPLE_SEARCH_URL}?${buildQS(peopleQS)}`;
  const pplResp = await postWithRetry(peopleSearchUrl);
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

  // Parse people results and collect unique organization_ids
  let peopleData: any = {};
  try { peopleData = pplRaw ? JSON.parse(pplRaw) : {}; } catch {}
  const records: any[] =
    Array.isArray(peopleData?.contacts) ? peopleData.contacts :
    Array.isArray(peopleData?.people)   ? peopleData.people   : [];

  const orgIdSet = new Set<string>();
  for (const r of records) {
    const id =
      (r?.organization_id && String(r.organization_id)) ||
      (r?.organization?.id && String(r.organization.id)) ||
      '';
    if (id) orgIdSet.add(id);
  }
  const orgIds = Array.from(orgIdSet);

  if (!orgIds.length) {
    return NextResponse.json({ companies: [], page, per_page, debug: debugBag });
  }

  /* --------------------------- Enrich each organization --------------------------- */

  const published_after = dateNDaysAgoYMD(90); // last 90 days for news

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

      // Hiring people panel (small set of internal TA/People roles)
      const hiringQS = buildQS({
        'organization_ids[]': [orgId],
        'person_titles[]': HIRING_TITLES,
        include_similar_titles: 'true',
        per_page: '10',
      });
      const hiringUrl = `${APOLLO_PEOPLE_SEARCH_URL}?${hiringQS}`;

      // News search
      const newsQS = buildQS({
        'organization_ids[]': [orgId],
        published_after,
        per_page: '2',
      });
      const newsUrl = `${APOLLO_NEWS_SEARCH_URL}?${newsQS}`;

      const [orgR, jobsR, hiringR, newsR] = await Promise.allSettled([
        // Org details
        fetch(APOLLO_ORG_GET_URL(orgId), {
          method: 'GET',
          headers: orgHeaders,
          cache: 'no-store',
        }).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // Job postings
        fetch(APOLLO_ORG_JOBS_URL(orgId), {
          method: 'GET',
          headers: jobsHeaders,
          cache: 'no-store',
        }).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // Hiring people
        postWithRetry(hiringUrl).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),

        // News
        postWithRetry(newsUrl).then(r => r.text().then(t => ({ ok: r.ok, status: r.status, body: t }))),
      ]);

      // --- Org details
      if (orgR.status === 'fulfilled' && orgR.value.ok) {
        try {
          const org = JSON.parse(orgR.value.body || '{}')?.organization || {};
          base.name           = org?.name ?? null;
          base.website_url    = org?.website_url ?? org?.domain ?? null;
          base.linkedin_url   = org?.linkedin_url ?? null;
          base.city           = org?.city ?? null;
          base.state          = org?.state ?? null;
          base.short_description = org?.short_description ?? null;
          base.exact_location = base.exact_location || [base.city, base.state].filter(Boolean).join(', ') || null;
        } catch {}
      }

      // --- Job postings
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

      // --- Hiring people
      if (hiringR.status === 'fulfilled' && hiringR.value.ok) {
        try {
          const hp = JSON.parse(hiringR.value.body || '{}');
          base.hiring_people =
            Array.isArray(hp?.contacts) ? hp.contacts :
            Array.isArray(hp?.people)   ? hp.people   : [];
        } catch { base.hiring_people = []; }
      }

      // --- News
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
          hiring_url:  hiringUrl,
          news_url:    newsUrl,
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

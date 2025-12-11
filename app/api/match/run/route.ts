// app/api/match/run/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

/* ============================================================
   Types
============================================================ */
type RunReq = {
  jobId?: string;
  job?: {
    title?: string;
    location?: string;
    skills?: string[];
    qualifications?: string[];
    description?: string;
  };
  limit?: number;
};

/* ============================================================
   Utility / Helpers
============================================================ */
const toClause = (field: string, value: string) =>
  `${field}:"${String(value ?? '').trim()}"#`;

function uniq(a: string[] = []) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of a) {
    const t = (v ?? '').toString().trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

function pickCityFromLocation(loc?: string) {
  if (!loc) return '';
  let s = (loc.split(',')[0] || '').trim();
  s = s.replace(/\s+/g, ' ');
  const qualifier =
    /^(?:(?:north|south|east|west)(?:\s*[- ]\s*(?:east|west))?|central|centre|greater|inner|outer|city of)\s+/i;
  while (qualifier.test(s)) s = s.replace(qualifier, '').trim();
  if (/london/i.test(loc)) return 'London';
  return s;
}

// Encode exactly like cURL
function encodeForVincereQuery(q: string) {
  return encodeURIComponent(q).replace(/%20/g, '+');
}

/* ============================================================
   Skill matching clause builders
============================================================ */
function buildSkillsClauseAND(skillA?: string, skillB?: string) {
  const norm = (s?: string) => String(s ?? '').trim().replace(/[#"]/g, '');
  const term = (s: string) => `skill:${s}#`;

  const a = norm(skillA);
  const b = norm(skillB);

  if (a && b) return `(${term(a)} AND ${term(b)})`;
  if (a) return term(a);
  if (b) return term(b);
  return '';
}

/* ============================================================
   Title + location clause builders
============================================================ */
function buildBaseClauses(job: NonNullable<RunReq['job']>, titleOverride?: string) {
  const title = (titleOverride ?? job.title ?? '').trim();
  const city = pickCityFromLocation(job.location);

  const titleClause = title ? `current_job_title:${title}#` : '';

  const cityClause = city
    ? `( ${toClause('current_city', city)} OR ${toClause('current_location_name', city)} )`
    : '';

  return { titleClause, cityClause };
}

function buildQueryWithPair(
  job: NonNullable<RunReq['job']>,
  pair: [string?, string?],
  titleOverride?: string
) {
  const { titleClause, cityClause } = buildBaseClauses(job, titleOverride);
  const skillsClause = buildSkillsClauseAND(pair[0], pair[1]);

  let q = '';
  if (titleClause) q = titleClause;
  if (cityClause) q = q ? `${q} AND ${cityClause}` : cityClause;
  if (skillsClause) q = q ? `${q} AND ${skillsClause}` : skillsClause;

  return q || '*:*';
}

function buildQueryOneSkill(job: NonNullable<RunReq['job']>, skill: string, titleOverride?: string) {
  const { titleClause, cityClause } = buildBaseClauses(job, titleOverride);
  const skillsClause = buildSkillsClauseAND(skill, undefined);

  let q = '';
  if (titleClause) q = titleClause;
  if (cityClause) q = q ? `${q} AND ${cityClause}` : cityClause;
  if (skillsClause) q = q ? `${q} AND ${skillsClause}` : skillsClause;

  return q || '*:*';
}

function buildQueryTitleCity(job: NonNullable<RunReq['job']>, titleOverride?: string) {
  const { titleClause, cityClause } = buildBaseClauses(job, titleOverride);
  let q = '';
  if (titleClause) q = titleClause;
  if (cityClause) q = q ? `${q} AND ${cityClause}` : cityClause;
  return q || '*:*';
}

/* ============================================================
   Title synonyms
============================================================ */
function buildPartialTitleVariants(fullTitle?: string): string[] {
  const t = String(fullTitle ?? '').trim();
  if (!t) return [];

  const words = t.split(/\s+/).filter(Boolean);
  const variants: string[] = [];

  if (words.length >= 3) {
    variants.push(`${words[0]} ${words[2]}`);
    variants.push(`${words[1]} ${words[2]}`);
  }
  if (words.length >= 2) variants.push(words.slice(1).join(' '));
  if (words.length >= 1) variants.push(words[words.length - 1]);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants.map(s => s.trim()).filter(Boolean)) {
    const k = v.toLowerCase();
    if (!seen.has(k) && k !== t.toLowerCase()) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/* ============================================================
   NEW — matrix vars now include all Option A fields
============================================================ */
function buildMatrixVars() {
  return [
    'fl=id',
    'first_name',
    'last_name',
    'current_job_title',
    'current_location',
    'current_location_name',
    'current_city',
    'current_employer',
    'current_company',
    'company',
    'linkedin',
    'skill',
    'edu_qualification',
    'professional_qualification',
    'edu_degree',
    'edu_course',
    'edu_institution',
    'edu_training',
    'sort=created_date asc'
  ].join(',');
}

/* ============================================================
   Helpers
============================================================ */
async function resolveJob(_session: any, body: RunReq) {
  if (body.job) return body.job;
  return null;
}

async function fetchWithAutoRefresh(url: string, idToken: string, userKey: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  headers.set('id-token', idToken);
  headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY);
  headers.set('accept', 'application/json');

  const doFetch = (h: Headers) =>
    fetch(url, { ...init, headers: h, method: 'GET', cache: 'no-store' });

  let resp = await doFetch(headers);
  if (resp.status === 401 || resp.status === 403) {
    try {
      const refreshed = await refreshIdToken(userKey);
      if (refreshed) {
        const s2 = await getSession();
        const id2 = s2.tokens?.idToken || '';
        if (id2) {
          headers.set('id-token', id2);
          resp = await doFetch(headers);
        }
      }
    } catch {}
  }
  return resp;
}

/* ============================================================
   Main route
============================================================ */
export async function POST(req: NextRequest) {
  try {
    requiredEnv();

    const session = await getSession();
    const idToken = session.tokens?.idToken || '';
    const userKey = session.user?.email || session.sessionId || 'anonymous';

    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as RunReq;

    const job = await resolveJob(session, body);
    if (!job) {
      return NextResponse.json({ error: 'Missing job details.' }, { status: 400 });
    }

    const hardLimit = Math.max(1, Math.min(500, Number(body.limit ?? 500)));

    /* ---------- Core logic (unchanged: multi-tier search) ---------- */

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');
    const encodedMatrix = encodeURIComponent(buildMatrixVars());

    const allSkills = uniq(job.skills ?? []);
    const coreSkills = allSkills.slice(0, 4);

    const skillPairs: Array<[string, string]> = [];
    for (let i = 0; i < coreSkills.length; i++) {
      for (let j = i + 1; j < coreSkills.length; j++) {
        skillPairs.push([coreSkills[i], coreSkills[j]]);
      }
    }

    const singleSkills = allSkills.slice(0, 6);

    const runOne = async (qRaw: string) => {
      const encodedQ = encodeForVincereQuery(qRaw);
      const url = `${base}/api/v2/candidate/search/${encodedMatrix}?q=${encodedQ}&limit=${hardLimit}`;
      const resp = await fetchWithAutoRefresh(url, idToken, userKey);
      const text = await resp.text();

      if (!resp.ok) {
        return { url, qRaw, ok: false, status: resp.status, detail: text, items: [] };
      }

      let json: any = {};
      try { json = JSON.parse(text); } catch {}

      const rawItems =
        json?.result?.items ??
        json?.data ??
        json?.items ??
        [];

      return { url, qRaw, ok: true, status: 200, items: rawItems };
    };

    const mergeRuns = (runsArr: Array<{ items: any[] }>) => {
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const r of runsArr) {
        for (const c of r.items) {
          const id = String(c?.id ?? '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(c);
        }
      }
      return merged;
    };

    const runs: any[] = [];
    let merged: any[] = [];

    // Tier 1: Title + City + skill pairs
    if (skillPairs.length > 0) {
      const tier1Qs = skillPairs.map(p => buildQueryWithPair(job, p));
      const tier1 = await Promise.all(tier1Qs.map(q => runOne(q)));
      runs.push(...tier1);
      merged = mergeRuns(runs);
    }

    // Tier 2: Partial titles + skill pairs
    if (merged.length < hardLimit) {
      const partials = buildPartialTitleVariants(job.title);
      if (partials.length > 0 && skillPairs.length > 0) {
        for (const pt of partials) {
          const qs = skillPairs.map(p => buildQueryWithPair(job, p, pt));
          const tier2 = await Promise.all(qs.map(q => runOne(q)));
          runs.push(...tier2);
          merged = mergeRuns(runs).slice(0, hardLimit);
        }
      }
    }

    // Tier 3: Title + single skills
    if (merged.length < hardLimit && singleSkills.length > 0) {
      const qs = singleSkills.map(s => buildQueryOneSkill(job, s));
      const tier3 = await Promise.all(qs.map(q => runOne(q)));
      runs.push(...tier3);
      merged = mergeRuns(runs).slice(0, hardLimit);
    }

    // Tier 4: Title only
    if (merged.length < hardLimit) {
      const tier4 = await runOne(buildQueryTitleCity(job));
      runs.push(tier4);
      merged = mergeRuns(runs).slice(0, hardLimit);

      // Tier 4b: Partial titles
      if (merged.length < hardLimit) {
        const partials = buildPartialTitleVariants(job.title);
        for (const pt of partials) {
          const qs = [buildQueryTitleCity(job, pt)];
          const tier4b = await Promise.all(qs.map(q => runOne(q)));
          runs.push(...tier4b);
          merged = mergeRuns(runs).slice(0, hardLimit);
        }
      }
    }

    /* ============================================================
       Normalise candidate objects for the frontend + AI
    ============================================================ */

    const toList = (v: any) => {
      if (Array.isArray(v)) {
        return v
          .map(x => {
            if (typeof x === 'string') return x;
            if (typeof x === 'number') return String(x);
            return x?.description ?? x?.value ?? x?.name ?? '';
          })
          .filter(Boolean);
      }
      if (typeof v === 'string') {
        return v.split(/[,;|/•#]+/g).map(s => s.trim()).filter(Boolean);
      }
      return [];
    };


    const results = merged.map((c: any) => {
      const first = c?.first_name ?? c?.firstName ?? '';
      const last  = c?.last_name ?? c?.lastName ?? '';
      const full  = (c?.name || `${first} ${last}`).trim();

      const locObj = c?.current_location || {};
      const title = c?.current_job_title ?? c?.title ?? '';

      const location =
        c?.current_location_name ||
        locObj?.location_name ||
        locObj?.address ||
        c?.location ||
        '';

      const city =
        c?.current_city ||
        locObj?.city ||
        '';

      const current_employer =
        c?.current_employer ||
        c?.current_company ||
        c?.company ||
        '';

      const edu_degree      = toList(c?.edu_degree);
      const edu_course      = toList(c?.edu_course);
      const edu_institution = toList(c?.edu_institution);
      const edu_training    = toList(c?.edu_training);

      const skills          = toList(c?.skill);
      const quals           = [
        ...toList(c?.edu_qualification),
        ...toList(c?.professional_qualification),
      ];

      return {
        id: String(c?.id ?? ''),
        fullName: full,
        title,
        location,         // FULL location as requested
        city,
        linkedin: c?.linkedin ?? null,
        skills,
        qualifications: quals,
        current_employer,
        edu_degree,
        edu_course,
        edu_institution,
        edu_training,
      };
    });

    return NextResponse.json({
      ok: true,
      query: {
        pairs: skillPairs.map(p => p.filter(Boolean)),
        partial_titles: buildPartialTitleVariants(job.title),
      },
      count: results.length,
      results,
      candidates: results, // backward compatibility
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

// app/api/match/run/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { config, requiredEnv } from '@/lib/config';
import { refreshIdToken } from '@/lib/vincereRefresh';

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

// -------- helpers ----------
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

// -------- skills (CONTAINING match) ----------
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

// Partial title variants
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

// Add your new fields into matrix variables:
function buildMatrixVars() {
  return 'fl=id,first_name,last_name,current_location,current_city,current_job_title,linkedin,skill,edu_qualification,professional_qualification,edu_degree,edu_course,edu_institution,edu_training,current_employer,current_company,company;sort=created_date asc';
}

async function resolveJob(_session: any, body: RunReq) {
  if (body.job) return body.job;
  return null;
}

async function fetchWithAutoRefresh(url: string, idToken: string, userKey: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  headers.set('id-token', idToken);
  headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY);
  headers.set('accept', 'application/json');

  const doFetch = (h: Headers) => fetch(url, { ...init, headers: h, method: 'GET', cache: 'no-store' });

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

    const hardLimit = Math.max(1, Math.min(100, Number(body.limit ?? 100)));
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

      const result = json?.result;
      const rawItems =
        Array.isArray(result?.items)
          ? result.items
          : Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.items)
              ? json.items
              : [];

      return { url, qRaw, ok: true, status: 200, items: rawItems };
    };

    const mergeRuns = (runsArr: Array<{ items: any[] }>) => {
      const seen = new Set<string>();
      const mergedList: any[] = [];

      for (const r of runsArr) {
        for (const c of r.items) {
          const id = String(c?.id ?? '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          mergedList.push(c);
        }
      }
      return mergedList;
    };

    const runs: any[] = [];
    let merged: any[] = [];

    if (skillPairs.length > 0) {
      const tier1Queries = skillPairs.map(pair => buildQueryWithPair(job, pair));
      const tier1Runs = await Promise.all(tier1Queries.map(q => runOne(q)));
      runs.push(...tier1Runs);
      merged = mergeRuns(runs);
    }

    if (merged.length < hardLimit) {
      const partials = buildPartialTitleVariants(job.title);
      if (partials.length > 0 && skillPairs.length > 0) {
        const tier2Queries: string[] = [];
        for (const pt of partials) {
          for (const pair of skillPairs) {
            tier2Queries.push(buildQueryWithPair(job, pair, pt));
          }
        }

        for (let i = 0; i < tier2Queries.length && merged.length < hardLimit; i += 5) {
          const batch = tier2Queries.slice(i, i + 5);
          const tier2Runs = await Promise.all(batch.map(q => runOne(q)));
          runs.push(...tier2Runs);
          merged = mergeRuns(runs).slice(0, hardLimit);
        }
      }
    }

    if (merged.length < hardLimit) {
      if (singleSkills.length > 0) {
        const tier3Queries = singleSkills.map(s => buildQueryOneSkill(job, s));
        for (let i = 0; i < tier3Queries.length && merged.length < hardLimit; i += 5) {
          const batch = tier3Queries.slice(i, i + 5);
          const tier3Runs = await Promise.all(batch.map(q => runOne(q)));
          runs.push(...tier3Runs);
          merged = mergeRuns(runs).slice(0, hardLimit);
        }
      }
    }

    if (merged.length < hardLimit) {
      const tier4Run = await runOne(buildQueryTitleCity(job));
      runs.push(tier4Run);
      merged = mergeRuns(runs).slice(0, hardLimit);

      if (merged.length < hardLimit) {
        const partials = buildPartialTitleVariants(job.title);
        for (let i = 0; i < partials.length && merged.length < hardLimit; i += 5) {
          const batch = partials.slice(i, i + 5).map(pt => buildQueryTitleCity(job, pt));
          const tier4bRuns = await Promise.all(batch.map(q => runOne(q)));
          runs.push(...tier4bRuns);
          merged = mergeRuns(runs).slice(0, hardLimit);
        }
      }
    }

    const toList = (v: any) => {
      if (Array.isArray(v)) {
        return v
          .map(x => (typeof x === 'string' ? x : (x?.description ?? x?.value ?? '')))
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

      const title = c?.current_job_title ?? c?.title ?? '';

      // location
      const locObj = c?.current_location;
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

      // NEW FIELDS
      const current_employer =
        c?.current_employer ||
        c?.current_company ||
        c?.company ||
        '';

      const edu_degree = toList(c?.edu_degree);
      const edu_course = toList(c?.edu_course);
      const edu_institution = toList(c?.edu_institution);
      const edu_training = toList(c?.edu_training);

      const skills = toList(c?.skill);
      const qualifications = [
        ...toList(c?.edu_qualification),
        ...toList(c?.professional_qualification),
      ];

      return {
        id: String(c?.id ?? ''),
        firstName: first,
        lastName: last,
        fullName: full,
        title,
        location,
        city,
        skills,
        qualifications,
        linkedin: c?.linkedin ?? null,

        // NEW FIELDS (Option A)
        current_employer,
        edu_degree,
        edu_course,
        edu_institution,
        edu_training,
      };
    });

    const count = results.length;

    return NextResponse.json({
      ok: true,
      runs: runs.map(r => ({
        ok: r.ok,
        status: r.status,
        url: r.url,
        q: r.qRaw
      })),
      query: {
        tiers: [
          'Tier1: title+city+pair-skills',
          'Tier2: partial-title+city+pair-skills',
          'Tier3: title+city+single-skill',
          'Tier4: title+city (and partial-title+city)'
        ],
        pairs: skillPairs.map(p => p.filter(Boolean)),
        partial_titles: buildPartialTitleVariants(job.title),
        limit: hardLimit,
      },
      count,
      results,
      candidates: results,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

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

// ---------- helpers ----------
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
  // normalize any London variant to London
  if (/london/i.test(loc)) return 'London';
  return s;
}

// Encode exactly like cURL: encode everything, then convert spaces to '+'
function encodeForVincereQuery(q: string) {
  return encodeURIComponent(q).replace(/%20/g, '+');
}

// -------- skills (CONTAINING in `skill` field only) ----------
function buildSkillsClauseAND(skillA?: string, skillB?: string) {
  const norm = (s?: string) => String(s ?? '').trim().replace(/[#"]/g, '');
  const term = (s: string) => `skill:${s}#`; // containing (unquoted) per Vincere docs

  const a = norm(skillA);
  const b = norm(skillB);

  if (a && b) return `(${term(a)} AND ${term(b)})`;
  if (a) return term(a);
  if (b) return term(b);
  return '';
}

// Base clauses shared by all runs
function buildBaseClauses(job: NonNullable<RunReq['job']>) {
  const title = (job.title ?? '').trim();
  const city = pickCityFromLocation(job.location);

  const titleClause = title ? toClause('current_job_title', title) : '';
  const cityClause = city
    ? `( ${toClause('current_city', city)} OR ${toClause('current_location_name', city)} )`
    : '';

  return { titleClause, cityClause };
}

// Build q with a specific pair of skills (A&B, B&C, C&D)
function buildQueryWithPair(job: NonNullable<RunReq['job']>, pair: [string?, string?]) {
  const { titleClause, cityClause } = buildBaseClauses(job);
  const skillsClause = buildSkillsClauseAND(pair[0], pair[1]);

  let q = '';
  if (titleClause) q = titleClause;
  if (cityClause) q = q ? `${q} AND ${cityClause}` : cityClause;
  if (skillsClause) q = q ? `${q} AND ${skillsClause}` : skillsClause;

  return q || '*:*';
}

// matrix_vars EXACT per your spec
function buildMatrixVars() {
  return 'fl=id,first_name,last_name,current_location,current_job_title,linkedin,keywords,skill,edu_qualification,edu_degree,edu_course,edu_institution,edu_training;sort=created_date asc';
}

// Prefer provided job (already extracted on the client)
async function resolveJob(_session: any, body: RunReq): Promise<RunReq['job'] | null> {
  if (body.job) return body.job;
  return null;
}

// GET with one auto-refresh retry
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
    } catch {
      /* ignore */
    }
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

    // Build up to three adjacent skill pairs: [A,B], [B,C], [C,D]
    const allSkills = uniq(job.skills ?? []);
    const pairs: Array<[string?, string?]> = [];
    for (let i = 0; i < Math.min(allSkills.length - 1, 3); i++) {
      pairs.push([allSkills[i], allSkills[i + 1]]);
    }
    // If less than 2 skills, still run a single search on the one provided
    if (pairs.length === 0 && allSkills.length === 1) {
      pairs.push([allSkills[0], undefined]);
    }
    // If no skills at all, run a single search with just title/location
    if (pairs.length === 0) {
      pairs.push([undefined, undefined]);
    }

    const limit = Math.max(1, Math.min(100, Number(body.limit ?? 100)));
    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');
    const encodedMatrix = encodeURIComponent(buildMatrixVars());

    // Runner for one query
    const runOne = async (qRaw: string) => {
      const encodedQ = encodeForVincereQuery(qRaw);
      const url =
        `${base}/api/v2/candidate/search/${encodedMatrix}` +
        `?q=${encodedQ}&limit=${limit}`;
      const resp = await fetchWithAutoRefresh(url, idToken, userKey);
      const text = await resp.text();
      if (!resp.ok) {
        return { url, qRaw, ok: false as const, status: resp.status, detail: text, items: [] as any[] };
      }
      let json: any = {};
      try { json = JSON.parse(text); } catch {}
      const result = json?.result;
      const rawItems = Array.isArray(result?.items)
        ? result.items
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.items)
            ? json.items
            : [];
      return { url, qRaw, ok: true as const, status: 200, items: rawItems };
    };

    // Execute all runs
    const queries = pairs.map((pair) => buildQueryWithPair(job, pair));
    const runs = await Promise.all(queries.map(q => runOne(q)));

    // Merge & de-dupe
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const r of runs) {
      for (const c of r.items) {
        const id = String(c?.id ?? '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(c);
      }
    }

    // Map to your existing shape
    const toList = (v: any) =>
      Array.isArray(v)
        ? v
            .map((x) => (typeof x === 'string' ? x : (x?.description ?? x?.value ?? '')))
            .filter(Boolean)
        : [];

    const results = merged.map((c: any) => {
      const first = c?.first_name ?? c?.firstName ?? '';
      const last = c?.last_name ?? c?.lastName ?? '';
      const full = (c?.name || `${first} ${last}`).trim();
      const title = c?.current_job_title ?? c?.title ?? '';
      const location = c?.current_location_name ?? c?.location ?? '';
      const city = c?.current_city ?? '';

      const skills = toList(c?.skill);
      const quals = [
        ...toList(c?.edu_qualification),
        ...toList(c?.edu_degree),
        ...toList(c?.edu_course),
        ...toList(c?.edu_institution),
        ...toList(c?.edu_training),
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
        qualifications: quals,
        linkedin: c?.linkedin ?? null,
      };
    });

    const count = results.length;

    return NextResponse.json({
      ok: true,
      // helpful to inspect what was actually run
      runs: runs.map(r => ({ ok: r.ok, status: r.status, url: r.url, q: r.qRaw })),
      query: { pairs: pairs.map(p => p.filter(Boolean)), limit },
      count,
      results,
      candidates: results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

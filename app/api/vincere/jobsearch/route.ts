// app/api/vincere/jobsearch/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

// ---------- helpers ----------
function encodeForVincereQuery(q: string) {
  return encodeURIComponent(q).replace(/%20/g, '+')
}

function buildMatrixVars() {
  // include the core job fields we need
  return 'fl=id,job_title,public_description,internal_description,keywords,location;sort=created_date desc'
}

async function fetchWithAutoRefresh(url: string, idToken: string, userKey: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {})
  headers.set('id-token', idToken)
  headers.set('x-api-key', (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY)
  headers.set('accept', 'application/json')

  const doFetch = (h: Headers) => fetch(url, { ...init, headers: h, method: 'GET', cache: 'no-store' })

  let resp = await doFetch(headers)
  if (resp.status === 401 || resp.status === 403) {
    try {
      const refreshed = await refreshIdToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        const id2 = s2.tokens?.idToken || ''
        if (id2) {
          headers.set('id-token', id2)
          resp = await doFetch(headers)
        }
      }
    } catch {
      /* ignore */
    }
  }
  return resp
}

// ---------- main ----------
export async function GET(req: NextRequest) {
  try {
    requiredEnv();
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('id');
    if (!jobId) {
      return NextResponse.json({ error: 'Missing job ID' }, { status: 400 });
    }

    const session = await getSession();
    const idToken = session.tokens?.idToken || '';
    const userKey = session.user?.email || session.sessionId || 'anonymous';
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere.' }, { status: 401 });
    }

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '');
    const matrixVars = 'fl=id,job_title,public_description,internal_description,keywords,location;sort=created_date desc';
    const query = encodeForVincereQuery(`id:${jobId}`);
    const url = `${base}/api/v2/job/search/${matrixVars}?q=${query}&limit=1`;

    const resp = await fetchWithAutoRefresh(url, idToken, userKey);
    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json({ error: 'Vincere job search failed', detail: text }, { status: resp.status });
    }

    const json = JSON.parse(text);
    const items = json?.result?.items || json?.data || json?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Job not found for this ID' }, { status: 404 });
    }

    const job = items[0];
    const job_title = job?.job_title || '';
    const public_description = job?.public_description || '';
    const internal_description = job?.internal_description || '';
    const location = typeof job?.location === 'string'
      ? job.location
      : job?.location?.location_name || job?.location?.city || '';
    const keywords = Array.isArray(job?.keywords)
      ? job.keywords.map((k: any) => (typeof k === 'string' ? k : k?.value || '')).filter(Boolean)
      : typeof job?.keywords === 'string'
        ? job.keywords.split(/[,;|/]+/g).map((s: string) => s.trim()).filter(Boolean)
        : [];

    return NextResponse.json({
      id: job?.id || jobId,
      job_title: job_title.trim(),
      public_description,
      internal_description,
      location: location.trim(),
      keywords,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}


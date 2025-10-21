// app/api/apollo/people-search/route.ts
import { NextRequest, NextResponse } from 'next/server';

type SearchBody = {
  title?: string | string[];          // e.g. "Field Service Technician" or ["Field...", "Service..."]
  location?: string | string[];       // e.g. "California" or ["California","Nevada"]
  keywords?: string;                   // extra free-text keywords
  type?: 'permanent' | 'contract';     // controls IR35/pay-rate keyword behaviour
  emailStatus?: string;                // maps to contact_email_status[] (default: 'verified')
  page?: number;                       // default 1
  perPage?: number;                    // default 100
};

function toArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v)
    ? v.map(s => s.trim()).filter(Boolean)
    : v.split(',').map(s => s.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  const apolloApiKey = process.env.APOLLO_API_KEY;
  const DEBUG = (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true';

  if (!apolloApiKey) {
    return NextResponse.json(
      { error: 'Missing APOLLO_API_KEY env var' },
      { status: 500 }
    );
  }

  // 2) Parse body
  let body: SearchBody = {};
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    body = {};
  }

  const titles = toArray(body.title);
  const locations = toArray(body.location);
  const keywords = (body.keywords ?? '').trim();
  const type = (body.type ?? 'permanent') as 'permanent' | 'contract';
  const emailStatus = (body.emailStatus ?? 'verified').trim();
  const page = Number.isFinite(body.page) && body.page! > 0 ? body.page! : 1;
  const perPage =
    Number.isFinite(body.perPage) && body.perPage! > 0
      ? Math.min(body.perPage!, 200)
      : 100;

  // 3) Build Apollo URL with query params (Apollo expects arrays via [] suffix)
  const searchUrl = new URL('https://api.apollo.io/api/v1/mixed_people/search');

  titles.forEach(t => searchUrl.searchParams.append('person_titles[]', t));
  locations.forEach(l => searchUrl.searchParams.append('person_locations[]', l));

  // Always prefer verified emails unless overridden
  if (emailStatus) {
    searchUrl.searchParams.append('contact_email_status[]', emailStatus);
  }

  // Compose keyword string:
  // - contract  => include IR35 & "pay rate"
  // - permanent => exclude IR35 & "pay rate"
  // Only add keyword filters if user typed them.
  // For validation, comment out the roleType logic:
  const kwParts: string[] = [];
  if (keywords) kwParts.push(keywords);
  // if (type === 'contract') { kwParts.push('IR35', '"pay rate"'); }
  // else { kwParts.push('-IR35', '-"pay rate"'); }
  if (kwParts.length) searchUrl.searchParams.set('q_keywords', kwParts.join(' '));
  }

  searchUrl.searchParams.set('page', String(page));
  searchUrl.searchParams.set('per_page', String(perPage));

  // 4) Call Apollo (POST with headers; query in URL)
  const headers: Record<string, string> = {
    accept: 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'X-Api-Key': apolloApiKey, // if your workspace requires Bearer, swap to Authorization: `Bearer ${apolloApiKey}`
  };

  // DEBUG: log outbound request (mask secrets)
  if (DEBUG) {
    console.info('[Apollo DEBUG] Outbound request → Apollo', {
      method: 'POST',
      url: searchUrl.toString(),
      headers: {
        ...headers,
        'X-Api-Key': '***MASKED***',
        Authorization: headers['Authorization'] ? '***MASKED***' : undefined,
      },
      inputs: {
        titles,
        locations,
        keywords,
        type,
        emailStatus,
        page,
        perPage,
      },
      curl: [
        'curl -X POST',
        `'${searchUrl.toString()}'`,
        "-H 'accept: application/json'",
        "-H 'Cache-Control: no-cache'",
        "-H 'Content-Type: application/json'",
        "-H 'X-Api-Key: ***MASKED***'",
      ].join(' ')
    });
  }

  const t0 = Date.now();
  let rawText = '';
  let status = 0;
  let statusText = '';

  try {
    const resp = await fetch(searchUrl.toString(), {
      method: 'POST',
      headers,
      cache: 'no-store',
    });

    status = resp.status;
    statusText = resp.statusText;
    rawText = await resp.text().catch(() => '');

    if (DEBUG) {
      console.info('[Apollo DEBUG] Response ← Apollo', {
        status: resp.status,
        statusText: resp.statusText,
        durationMs: Date.now() - t0,
        rawPreview: rawText.slice(0, 2000),
      });
    }

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Apollo error: ${resp.status} ${resp.statusText}`, details: rawText.slice(0, 2000) },
        { status: resp.status }
      );
    }

    // 6) Normalize response for your UI
    let data: any = {};
    try { data = rawText ? JSON.parse(rawText) : {}; } catch { data = {}; }
    
    const arr = Array.isArray(data?.people)
      ? data.people
      : Array.isArray(data?.contacts)
        ? data.contacts
        : [];
    
    const people = arr.map((p: any) => ({
      id: p?.id ?? '',
      name: p?.name ?? [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null,
      title: p?.title ?? null,
      company: p?.organization?.name ?? p?.employment_history?.[0]?.organization_name ?? null,
      linkedin_url: p?.linkedin_url ?? null,
    }));

    // (Optional) You can return pagination for debugging if needed:
    // const pagination = data?.pagination ?? null;

    return NextResponse.json({ people });
  } catch (err: any) {
    if (DEBUG) {
      console.error('[Apollo DEBUG] Fetch threw', {
        durationMs: Date.now() - t0,
        status,
        statusText,
        error: String(err),
      });
    }
    return NextResponse.json(
      { error: 'Server error during Apollo request', details: String(err) },
      { status: 500 }
    );
  }
}

// (Optional) Guard accidental GETs with a clear message
export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/people-search with a JSON body.' },
    { status: 405 }
  );
}

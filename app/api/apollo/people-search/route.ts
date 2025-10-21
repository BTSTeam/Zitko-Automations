// app/api/apollo/people-search/route.ts
import { NextRequest, NextResponse } from 'next/server';

type SearchBody = {
  title?: string | string[];
  location?: string | string[];
  keywords?: string;
  type?: 'permanent' | 'contract';
  emailStatus?: string; // e.g. 'verified'
  page?: number;
  perPage?: number;
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
      { status: 500 },
    );
  }

  // Parse body
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
  const page = Number.isFinite(body.page) && (body.page as number) > 0 ? (body.page as number) : 1;
  const perPageRaw = Number.isFinite(body.perPage) && (body.perPage as number) > 0 ? (body.perPage as number) : 100;
  const perPage = Math.min(perPageRaw, 100); // Apollo max 100/page

  // Build Apollo URL with query params
  const searchUrl = new URL('https://api.apollo.io/api/v1/mixed_people/search');

  titles.forEach(t => searchUrl.searchParams.append('person_titles[]', t));

  // Tip: Apollo examples often include country, e.g. "California, US".
  locations.forEach(l => searchUrl.searchParams.append('person_locations[]', l));

  if (emailStatus) {
    // If your workspace expects v2, try 'contact_email_status_v2[]'
    searchUrl.searchParams.append('contact_email_status[]', emailStatus);
  }

  // q_keywords – keep it minimal while validating; add contract/permanent flavor later if desired
  const kwParts: string[] = [];
  if (keywords) kwParts.push(keywords);
  if (kwParts.length > 0) {
    searchUrl.searchParams.set('q_keywords', kwParts.join(' '));
  }

  searchUrl.searchParams.set('page', String(page));
  searchUrl.searchParams.set('per_page', String(perPage));

  const headers: Record<string, string> = {
    accept: 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'X-Api-Key': apolloApiKey,
  };

  if (DEBUG) {
    console.info('[Apollo DEBUG] Outbound request → Apollo', {
      method: 'POST',
      url: searchUrl.toString(),
      headers: {
        ...headers,
        'X-Api-Key': '***MASKED***',
      },
      inputs: { titles, locations, keywords, type, emailStatus, page, perPage },
      curl: [
        'curl -X POST',
        `'${searchUrl.toString()}'`,
        "-H 'accept: application/json'",
        "-H 'Cache-Control: no-cache'",
        "-H 'Content-Type: application/json'",
        "-H 'X-Api-Key: ***MASKED***'",
      ].join(' '),
    });
  }

  const t0 = Date.now();
  let rawText = '';

  try {
    const resp = await fetch(searchUrl.toString(), {
      method: 'POST',
      headers,
      cache: 'no-store',
    });

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
        {
          error: `Apollo error: ${resp.status} ${resp.statusText}`,
          details: rawText.slice(0, 2000),
        },
        { status: resp.status },
      );
    }

    // Normalize response
    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }

    // Apollo often returns `contacts` (and sometimes `people`). Handle both.
    const arr: any[] = Array.isArray(data?.contacts)
      ? data.contacts
      : Array.isArray(data?.people)
        ? data.people
        : [];

    const people = arr.map((p: any) => {
      // build name without mixing ?? and ||
      let name: string | null = null;
      if (typeof p?.name === 'string' && p.name.trim()) {
        name = p.name.trim();
      } else {
        const first = typeof p?.first_name === 'string' ? p.first_name.trim() : '';
        const last = typeof p?.last_name === 'string' ? p.last_name.trim() : '';
        const joined = [first, last].filter(Boolean).join(' ').trim();
        name = joined ? joined : null;
      }

      // company
      let company: string | null = null;
      if (typeof p?.organization?.name === 'string' && p.organization.name.trim()) {
        company = p.organization.name.trim();
      } else if (Array.isArray(p?.employment_history) && p.employment_history.length > 0) {
        const orgName = p.employment_history[0]?.organization_name;
        company = typeof orgName === 'string' && orgName.trim() ? orgName.trim() : null;
      }

      const title = typeof p?.title === 'string' && p.title.trim() ? p.title.trim() : null;
      const linkedin_url = typeof p?.linkedin_url === 'string' && p.linkedin_url ? p.linkedin_url : null;

      return {
        id: p?.id ?? '',
        name,
        title,
        company,
        linkedin_url,
      };
    });

    return NextResponse.json({ people });
  } catch (err: any) {
    if (DEBUG) {
      console.error('[Apollo DEBUG] Fetch threw', {
        durationMs: Date.now() - t0,
        error: String(err),
      });
    }
    return NextResponse.json(
      { error: 'Server error during Apollo request', details: String(err) },
      { status: 500 },
    );
  }
}

// Guard accidental GETs with a clear message
export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/people-search with a JSON body.' },
    { status: 405 },
  );
}

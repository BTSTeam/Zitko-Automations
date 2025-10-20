// app/api/apollo/people-search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requiredEnv } from '@/lib/config';

export async function GET(req: NextRequest) {
  const apolloApiKey = requiredEnv('APOLLO_API_KEY');
  const params = new URL(req.url).searchParams;
  const titles = (params.get('title') ?? '').split(',').map(t => t.trim()).filter(Boolean);
  const locations = (params.get('location') ?? '').split(',').map(l => l.trim()).filter(Boolean);
  const keywords = params.get('keywords') ?? '';
  const type = params.get('type') ?? 'permanent';

  const searchUrl = new URL('https://api.apollo.io/api/v1/mixed_people/search');
  titles.forEach(t => searchUrl.searchParams.append('person_titles[]', t));
  locations.forEach(l => searchUrl.searchParams.append('person_locations[]', l));

  // build a keyword string; include IR35 & pay rate for contracts, exclude for permanent
  const kw = [];
  if (keywords) kw.push(keywords);
  if (type === 'contract') kw.push('IR35', 'pay rate');
  else kw.push('-IR35', '-pay rate');
  if (kw.length) searchUrl.searchParams.append('q_keywords', kw.join(' '));

  searchUrl.searchParams.set('per_page', '100');

  const resp = await fetch(searchUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apolloApiKey,
    },
  });
  if (!resp.ok) {
    return NextResponse.json({ error: `Apollo error: ${resp.statusText}` }, { status: resp.status });
  }
  const data = await resp.json();
  const people = Array.isArray(data.people)
    ? data.people.map((p: any) => ({
        id: p.id,
        name: p.name,
        title: p.title,
        company: p.organization?.name ?? null,
        linkedin_url: p.linkedin_url ?? null,
      }))
    : [];
  return NextResponse.json({ people });
}

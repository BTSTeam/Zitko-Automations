// app/api/apollo/people-search/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Simpler than using requiredEnv: just read the env var
  const apolloApiKey = process.env.APOLLO_API_KEY
  if (!apolloApiKey) {
    return NextResponse.json(
      { error: 'Missing APOLLO_API_KEY env var' },
      { status: 500 }
    )
  }

  const params = new URL(req.url).searchParams
  const titles = (params.get('title') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const locations = (params.get('location') ?? '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean)

  const keywords = params.get('keywords') ?? ''
  const type = (params.get('type') ?? 'permanent') as 'permanent' | 'contract'

  const searchUrl = new URL('https://api.apollo.io/api/v1/mixed_people/search')
  titles.forEach((t) => searchUrl.searchParams.append('person_titles[]', t))
  locations.forEach((l) => searchUrl.searchParams.append('person_locations[]', l))

  // Compose keyword string:
  // - contract => include IR35 & pay rate
  // - permanent => exclude IR35 & pay rate
  const kwParts: string[] = []
  if (keywords.trim()) kwParts.push(keywords.trim())
  if (type === 'contract') {
    kwParts.push('IR35', 'pay rate')
  } else {
    kwParts.push('-IR35', '-pay rate')
  }
  if (kwParts.length) searchUrl.searchParams.append('q_keywords', kwParts.join(' '))

  searchUrl.searchParams.set('per_page', '100')

  const resp = await fetch(searchUrl.toString(), {
    method: 'POST', // Apollo docs show POST with query params
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apolloApiKey,
      accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return NextResponse.json(
      { error: `Apollo error: ${resp.status} ${resp.statusText}`, details: text.slice(0, 2000) },
      { status: resp.status }
    )
  }

  const data = await resp.json()
  const people = Array.isArray(data?.people)
    ? data.people.map((p: any) => ({
        id: p?.id ?? '',
        name: p?.name ?? null,
        title: p?.title ?? null,
        company: p?.organization?.name ?? null,
        linkedin_url: p?.linkedin_url ?? null,
      }))
    : []

  return NextResponse.json({ people })
}

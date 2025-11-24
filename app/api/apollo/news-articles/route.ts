// app/api/apollo/news-articles/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_NEWS_URL = 'https://api.apollo.io/api/v1/news_articles/search'
const LOOKBACK_DAYS = 90
const FIXED_PAGE = 1
const FIXED_PER_PAGE = 2 // hardcoded: always 2

type InBody = {
  org_ids?: string[]
}

async function buildAuthHeaders() {
  const session = await getSession()
  const accessToken: string | undefined = session.tokens?.apolloAccessToken || undefined
  const apiKey: string | undefined = process.env.APOLLO_API_KEY || undefined

  if (!accessToken && !apiKey) {
    return {
      error: NextResponse.json(
        { error: 'Not authenticated: no Apollo OAuth token or APOLLO_API_KEY present' },
        { status: 401 },
      ),
    }
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  else headers['X-Api-Key'] = apiKey!

  return { headers, accessToken, userKey: (session.user?.email || session.sessionId || '') }
}

export async function POST(req: NextRequest) {
  const WANT_DEBUG =
    (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true' ||
    req.headers.get('x-debug-apollo') === '1'

  let body: InBody = {}
  try {
    body = await req.json()
  } catch {}

  const orgIds: string[] = Array.isArray(body.org_ids)
    ? body.org_ids.map(s => (s || '').trim()).filter(Boolean)
    : []

  if (!orgIds.length) {
    return NextResponse.json({ error: 'org_ids[] is required' }, { status: 400 })
  }

  // Always last 90 days
  const now = new Date()
  const maxDate = now.toISOString().slice(0, 10)
  const minDate = new Date(now.getTime() - LOOKBACK_DAYS * 86400000)
    .toISOString()
    .slice(0, 10)

  // Auth
  const auth = await buildAuthHeaders()
  if ('error' in auth) return auth.error
  let { headers, accessToken, userKey } = auth

  const tryRefresh = async () => {
    if (accessToken && userKey) {
      const refreshed = await refreshApolloAccessToken(userKey)
      if (refreshed) {
        const s2 = await getSession()
        accessToken = s2.tokens?.apolloAccessToken
        const h: Record<string, string> = {
          accept: 'application/json',
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
        }
        if (accessToken) h.Authorization = `Bearer ${accessToken}`
        else if (process.env.APOLLO_API_KEY) h['X-Api-Key'] = process.env.APOLLO_API_KEY
        headers = h
      }
    }
    return headers
  }

  try {
    // Build FULL query-string URL with all organization_ids[]
    const qs = new URLSearchParams()

    for (const id of orgIds) {
      qs.append('organization_ids[]', id)
    }

    qs.set('published_at[min]', minDate)
    qs.set('published_at[max]', maxDate)
    qs.set('page', String(FIXED_PAGE))
    qs.set('per_page', String(FIXED_PER_PAGE))

    const fullUrl = `${APOLLO_NEWS_URL}?${qs.toString()}`

    // Single request – Apollo will handle multiple org IDs
    let resp = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({}), // Apollo reads query-string fields
      cache: 'no-store',
    })

    if (resp.status === 401 || resp.status === 403) {
      const h2 = await tryRefresh()
      resp = await fetch(fullUrl, {
        method: 'POST',
        headers: h2,
        body: JSON.stringify({}),
        cache: 'no-store',
      })
    }

    const text = await resp.text().catch(() => '')
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {}

    if (!resp.ok) {
      return NextResponse.json(
        {
          error: `Apollo news_articles/search failed – ${resp.status}`,
          details: text.slice(0, 1200),
          url: fullUrl,
        },
        { status: resp.status },
      )
    }

    // Extract articles
    const rawArticles: any[] =
      (Array.isArray(data.news_articles) && data.news_articles) ||
      (Array.isArray(data.articles) && data.articles) ||
      []

    // Group by org_id fields
    const articlesByOrg: Record<string, any[]> = {}

    for (const a of rawArticles) {
      const primaryId =
        (a?.organization_id ??
          a?.org_id ??
          a?.account_id ??
          '')?.toString().trim()

      const extraIds: string[] = Array.isArray(a.organization_ids)
        ? a.organization_ids.map((x: any) => (x ?? '').toString().trim()).filter(Boolean)
        : []

      const allIds = [...extraIds, primaryId].filter(Boolean)

      for (const oid of allIds) {
        if (!articlesByOrg[oid]) articlesByOrg[oid] = []
        articlesByOrg[oid].push(a)
      }
    }

    return NextResponse.json({
      articlesByOrg,
      debug: WANT_DEBUG
        ? { url: fullUrl, orgIds, count: rawArticles.length, minDate, maxDate }
        : undefined,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error in news-articles route', details: String(err) },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/news-articles with a list of org_ids.' },
    { status: 405 },
  )
}

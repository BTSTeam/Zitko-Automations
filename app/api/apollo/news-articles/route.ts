// app/api/apollo/news-articles/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

type PostBody = {
  org_ids?: string[]
  per_page?: number
}

export async function POST(req: NextRequest) {
  try {
    const { org_ids, per_page }: PostBody = await req.json()

    if (!org_ids || !org_ids.length) {
      return NextResponse.json(
        { error: 'org_ids array is required' },
        { status: 400 },
      )
    }

    const apiKey = process.env.APOLLO_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing APOLLO_API_KEY' },
        { status: 500 },
      )
    }

    // Date range: today back 90 days (YYYY-MM-DD)
    const now = new Date()
    const maxDate = now.toISOString().split('T')[0]
    const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const minDate = past.toISOString().split('T')[0]

    const searchParams = new URLSearchParams({
      'published_at[min]': minDate,
      'published_at[max]': maxDate,
      page: '1',
      per_page: String(per_page ?? 2),
    })

    const url = `https://api.apollo.io/api/v1/news_articles/search?${searchParams.toString()}`

    const apolloRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        organization_ids: org_ids,
      }),
    })

    if (!apolloRes.ok) {
      const text = await apolloRes.text()
      return NextResponse.json(
        {
          error: `Apollo news_articles/search failed – ${apolloRes.status}`,
          details: text,
        },
        { status: apolloRes.status },
      )
    }

    const apolloJson: any = await apolloRes.json()

    // Normalise / group by organisation
    const raw: any[] =
      (Array.isArray(apolloJson.news_articles) && apolloJson.news_articles) ||
      (Array.isArray(apolloJson.articles) && apolloJson.articles) ||
      []

    const articlesByOrg: Record<string, any[]> = {}
    for (const a of raw) {
      const key = (
        a.organization_id ||
        a.org_id ||
        a.account_id ||
        ''
      )
        .toString()
        .trim()
      if (!key) continue
      if (!articlesByOrg[key]) articlesByOrg[key] = []
      articlesByOrg[key].push(a)
    }

    return NextResponse.json({
      apollo: apolloJson,
      articlesByOrg,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

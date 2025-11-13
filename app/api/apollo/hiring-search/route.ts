// app/api/apollo/hiring-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

const APOLLO_API_KEY = process.env.APOLLO_API_KEY

if (!APOLLO_API_KEY) {
  throw new Error('APOLLO_API_KEY is not set')
}

const DEFAULT_HIRING_TITLES = [
  'Talent Acquisition',
  'Talent Acquisition Manager',
  'Talent Acquisition Partner',
  'TA Manager',
  'Recruitment Manager',
  'Head of Recruitment',
  'Head of Talent',
  'Internal Recruiter',
  'Recruiter',
  'Hiring Manager',
  'HR Manager',
  'People Manager',
]

type PostBody = {
  org_ids?: string[]
  per_page?: number
  person_titles?: string[]
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PostBody

    const orgIds = Array.isArray(body.org_ids)
      ? body.org_ids
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean)
      : []

    if (!orgIds.length) {
      return NextResponse.json(
        { error: 'org_ids[] is required' },
        { status: 400 },
      )
    }

    const perPageRaw = Number(body.per_page ?? 3)
    const per_page = Number.isFinite(perPageRaw)
      ? Math.min(Math.max(perPageRaw, 1), 10)
      : 3

    const person_titles =
      Array.isArray(body.person_titles) && body.person_titles.length
        ? body.person_titles
        : DEFAULT_HIRING_TITLES

    const apolloBody = {
      person_titles,
      include_similar_titles: true,
      organization_ids: orgIds,
      page: 1,
      per_page,
    }

    const resp = await fetch(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': APOLLO_API_KEY, // <-- KEY CHANGE
        },
        body: JSON.stringify(apolloBody),
      },
    )

    const text = await resp.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = {}
    }

    if (!resp.ok) {
      return NextResponse.json(
        {
          error:
            data?.error ||
            text ||
            'Apollo mixed_people search failed',
          apolloStatus: resp.status,
          apolloBody,
        },
        { status: resp.status },
      )
    }

    const list: any[] =
      (Array.isArray(data.people) && data.people) ||
      (Array.isArray(data.contacts) && data.contacts) ||
      []

    const hiringByOrg: Record<string, any[]> = {}

    for (const p of list) {
      const orgId = (
        p?.organization_id ??
        p?.org_id ??
        p?.account_id ??
        p?.organization?.id ??
        ''
      )
        .toString()
        .trim()

      if (!orgId) continue
      if (!hiringByOrg[orgId]) hiringByOrg[orgId] = []
      hiringByOrg[orgId].push(p)
    }

    return NextResponse.json({
      hiringByOrg,
      apollo: data,
    })
  } catch (err: any) {
    console.error('hiring-search route error', err)
    return NextResponse.json(
      { error: err?.message || 'Unexpected server error in hiring-search' },
      { status: 500 },
    )
  }
}

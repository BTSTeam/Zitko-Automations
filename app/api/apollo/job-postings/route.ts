// app/api/apollo/job-postings/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_ORG_URL = 'https://api.apollo.io/api/v1/organizations'

type InBody = {
  // Preferred: already-deduped org ids from company-search
  org_ids?: string[]
  // Optional: if you happen to pass objects
  companies?: Array<{ org_id: string }>
  // Optional override; defaults to 10
  per_page?: number
}

type JobPosting = {
  id: string
  title: string | null
  location: string | null
  posted_at: string | null
  url: string | null
  source: string | null
  raw?: any
}

async function buildAuthHeaders() {
  const session = await getSession()
  const accessToken: string | undefined = session.tokens?.apolloAccessToken || undefined
  const apiKey: string | undefined = process.env.APOLLO_API_KEY || undefined

  if (!accessToken && !apiKey) {
    return {
      error: NextResponse.json(
        { error: 'Not authenticated: no Apollo OAuth token or APOLLO_API_KEY present' },
        { status: 401 }
      ),
    }
  }

  // Use Authorization: Bearer for BOTH OAuth access tokens and API key
  const headers: Record<string, string> = {
    accept: 'application/json',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken ?? apiKey!}`,
  }

  return { headers, accessToken, userKey: (session.user?.email || session.sessionId || '') }
}

async function fetchOrganizationJobPostings(
  id: string,
  headers: Record<string, string>,
  tryRefresh: () => Promise<Record<string, string>>,
  limit = 10
): Promise<JobPosting[]> {
  const url = `${APOLLO_ORG_URL}/${encodeURIComponent(id)}/job_postings?page=1&per_page=${limit}`

  let resp = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
  if (resp.status === 401 || resp.status === 403) {
    const h2 = await tryRefresh()
    resp = await fetch(url, { method: 'GET', headers: h2, cache: 'no-store' })
  }
  if (!resp.ok) return []

  const json: any = await resp.json().catch(() => ({}))

  // Apollo spec: { organization_job_postings: [...] }
  const arr =
    (Array.isArray(json?.organization_job_postings) && json.organization_job_postings) ||
    (Array.isArray(json?.job_postings) && json.job_postings) || // fallback if variant
    (Array.isArray(json) && json) ||
    []

  return arr.slice(0, limit).map((j: any) => {
    const id = (j?.id ?? j?._id ?? '').toString()
    const title = typeof j?.title === 'string' ? j.title : null
    const city = typeof j?.city === 'string' ? j.city : null
    const state = typeof j?.state === 'string' ? j.state : null
    const country = typeof j?.country === 'string' ? j.country : null
    const location =
      (typeof j?.location === 'string' && j.location) ||
      [city, state, country].filter(Boolean).join(', ') ||
      null
    const posted_at =
      (typeof j?.posted_at === 'string' && j.posted_at) ||
      (typeof j?.created_at === 'string' && j.created_at) ||
      null
    const url =
      (typeof j?.job_posting_url === 'string' && j.job_posting_url) ||
      (typeof j?.url === 'string' && j.url) ||
      null
    const source =
      (typeof j?.board_name === 'string' && j.board_name) ||
      (typeof j?.source === 'string' && j.source) ||
      null

    return { id, title, location, posted_at, url, source, raw: j }
  })
}

export async function POST(req: NextRequest) {
  const WANT_DEBUG =
    (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true' ||
    req.headers.get('x-debug-apollo') === '1'
  const debug: any = {}

  // Input
  let body: InBody = {}
  try {
    body = await req.json()
  } catch {}

  const per_page = Math.min(50, Math.max(1, Number(body.per_page || 10) || 10)) // default 10
  const orgIds: string[] = [
    ...(Array.isArray(body.org_ids) ? body.org_ids : []),
    ...(Array.isArray(body.companies) ? body.companies.map(c => (c?.org_id ?? '').toString()) : []),
  ]
    .map(s => (s || '').trim())
    .filter(Boolean)

  if (!orgIds.length) {
    return NextResponse.json({ error: 'No org_ids provided' }, { status: 400 })
  }

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
          Authorization: `Bearer ${accessToken ?? process.env.APOLLO_API_KEY!}`,
        }
        headers = h
      }
    }
    return headers
  }

  try {
    // 1 GET per org_id
    const postingsByOrg: Record<string, JobPosting[]> = {}
    const dbgRows: any[] = []

    for (const org_id of orgIds) {
      const jobs = await fetchOrganizationJobPostings(org_id, headers, tryRefresh, per_page)
      postingsByOrg[org_id] = jobs
      if (WANT_DEBUG) dbgRows.push({ org_id, count: jobs.length })
    }

    return NextResponse.json({
      postingsByOrg,
      debug: WANT_DEBUG ? { rows: dbgRows.slice(0, 50) } : undefined,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error fetching job postings', details: String(err) },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST with a list of org_ids.' }, { status: 405 })
}

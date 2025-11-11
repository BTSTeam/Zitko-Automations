// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_companies/search'
const APOLLO_ORG_URL = 'https://api.apollo.io/api/v1/organizations'

type InBody = {
  locations?: string[] | string
  keywords?: string[] | string
  employeeRanges?: string[] | string
  employeesMin?: number | string | null
  employeesMax?: number | string | null
  activeJobsOnly?: boolean
  activeJobsDays?: number | string | null
  jobTitles?: string[] | string
  page?: number | string
  per_page?: number | string
}

function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(s => s.trim()).filter(Boolean)
  return v.split(',').map(s => s.trim()).filter(Boolean)
}
function toPosInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? Math.floor(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10) }
function dateNDaysAgoYMD(days: number): string { return ymd(new Date(Date.now() - days*86400000)) }
function todayYMD(): string { return ymd(new Date()) }

const CRM_TECH_NAMES = [
  'Vincere','Bullhorn','TrackerRMS','PC Recruiter','Catsone','Zoho Recruit','JobAdder','Crelate','Avionte',
]
const CRM_TECH_UIDS = CRM_TECH_NAMES.map(n => n.trim().toLowerCase().replace(/\s+/g, '_'))

function isStaffingRecruitmentIndustry(names: string[]): boolean {
  const lc = names.map(s => s.toLowerCase())
  if (lc.includes('staffing & recruitment')) return true
  if (lc.includes('staffing & recruiting')) return true
  return lc.some(s => s.includes('staffing') && s.includes('recruit'))
}
function extractIndustryNames(orgDetail: any): string[] {
  const raw = orgDetail?.organization ?? orgDetail ?? {}
  const arr = Array.isArray(raw.industries) ? raw.industries : []
  const names: string[] = []
  for (const it of arr) {
    if (typeof it === 'string') names.push(it)
    else if (it && typeof it.name === 'string') names.push(it.name)
  }
  return names.filter(Boolean)
}

async function buildAuthHeaders() {
  const session = await getSession()
  const accessToken: string | undefined = session.tokens?.apolloAccessToken || undefined
  const apiKey: string | undefined = process.env.APOLLO_API_KEY || undefined
  if (!accessToken && !apiKey) {
    return { error: NextResponse.json({ error: 'Not authenticated: no Apollo OAuth token or APOLLO_API_KEY present' }, { status: 401 }) }
  }
  const headers: Record<string, string> = {
    accept: 'application/json','Cache-Control': 'no-cache','Content-Type': 'application/json',
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  else if (apiKey) headers['X-Api-Key'] = apiKey
  return { headers, accessToken, userKey: session.user?.email || session.sessionId || '' }
}

async function fetchOrganizationDetail(
  id: string,
  headers: Record<string,string>,
  tryRefresh: () => Promise<Record<string,string>>,
): Promise<any|null> {
  const url = `${APOLLO_ORG_URL}/${encodeURIComponent(id)}`
  let resp = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
  if (resp.status === 401 || resp.status === 403) {
    const h2 = await tryRefresh()
    resp = await fetch(url, { method: 'GET', headers: h2, cache: 'no-store' })
  }
  if (!resp.ok) return null
  try { return await resp.json() } catch { return null }
}

async function fetchOrganizationJobPostings(
  id: string,
  headers: Record<string,string>,
  tryRefresh: () => Promise<Record<string,string>>,
  limit = 10,
): Promise<any[]> {
  // Try with explicit per_page if supported; otherwise slice client-side
  const url = `${APOLLO_ORG_URL}/${encodeURIComponent(id)}/job_postings?per_page=${limit}&page=1`
  let resp = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
  if (resp.status === 401 || resp.status === 403) {
    const h2 = await tryRefresh()
    resp = await fetch(url, { method: 'GET', headers: h2, cache: 'no-store' })
  }
  if (!resp.ok) return []
  let json: any = {}
  try { json = await resp.json() } catch { return [] }
  const arr = Array.isArray(json?.job_postings) ? json.job_postings : Array.isArray(json) ? json : []
  return arr.slice(0, limit).map((j: any) => {
    const id = (j?.id ?? j?._id ?? '').toString()
    const title = typeof j?.title === 'string' ? j.title : null
    const city = typeof j?.city === 'string' ? j.city : null
    const state = typeof j?.state === 'string' ? j.state : null
    const country = typeof j?.country === 'string' ? j.country : null
    const location = (typeof j?.location === 'string' && j.location) || [city,state,country].filter(Boolean).join(', ') || null
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
  const DEBUG = (process.env.SOURCING_DEBUG_APOLLO || '').toLowerCase() === 'true'

  // input
  let inBody: InBody = {}
  try { inBody = (await req.json()) as InBody } catch {}

  const organization_locations = toArray(inBody.locations)
  const employeeRangesIncoming = toArray(inBody.employeeRanges)
  const minNum = inBody.employeesMin === '' || inBody.employeesMin == null ? null : Number(inBody.employeesMin)
  const maxNum = inBody.employeesMax === '' || inBody.employeesMax == null ? null : Number(inBody.employeesMax)
  const organization_num_employees_ranges: string[] = [...employeeRangesIncoming]
  if (!organization_num_employees_ranges.length && (typeof minNum === 'number' || typeof maxNum === 'number')) {
    const min = Number.isFinite(minNum) ? String(minNum) : ''
    const max = Number.isFinite(maxNum) ? String(maxNum) : ''
    const r = [min, max].filter(Boolean).join(',')
    if (r) organization_num_employees_ranges.push(r)
  }
  const q_organization_job_titles = toArray(inBody.jobTitles)
  const q_organization_keyword_tags = toArray(inBody.keywords)
  const page = toPosInt(inBody.page, 1)
  const per_page = Math.min(50, toPosInt(inBody.per_page, 25))
  const activeJobsOnly = Boolean(inBody.activeJobsOnly)
  const jobsWindowDays =
    Number.isFinite(Number(inBody.activeJobsDays)) && Number(inBody.activeJobsDays) > 0
      ? Math.floor(Number(inBody.activeJobsDays))
      : null

  // auth
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
          accept: 'application/json','Cache-Control': 'no-cache','Content-Type': 'application/json',
        }
        if (accessToken) h.Authorization = `Bearer ${accessToken}`
        else if (process.env.APOLLO_API_KEY) h['X-Api-Key'] = process.env.APOLLO_API_KEY
        headers = h
      }
    }
    return headers
  }

  // build QS
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('per_page', String(per_page))
  params.set('include_similar_titles', 'true')

  organization_locations.forEach(l => params.append('organization_locations[]', l))
  organization_num_employees_ranges.forEach(r => params.append('organization_num_employees_ranges[]', r))
  q_organization_job_titles.forEach(t => params.append('q_organization_job_titles[]', t))
  q_organization_keyword_tags.forEach(tag => params.append('q_organization_keyword_tags[]', tag))
  CRM_TECH_UIDS.forEach(uid => params.append('currently_not_using_any_of_technology_uids[]', uid))

  if (activeJobsOnly) {
    params.append('organization_num_jobs_range[min]', '1')
    params.append('organization_num_jobs_range[max]', '100')
    if (jobsWindowDays != null) {
      params.append('organization_job_posted_at_range[min]', dateNDaysAgoYMD(jobsWindowDays))
      params.append('organization_job_posted_at_range[max]', todayYMD())
    }
  }

  const urlWithQs = `${APOLLO_SEARCH_URL}?${params.toString()}`
  const searchCall = (h: Record<string, string>) =>
    fetch(urlWithQs, { method: 'POST', headers: h, body: JSON.stringify({}), cache: 'no-store' })

  if (DEBUG) {
    const dbgHeaders = { ...headers }
    if (dbgHeaders.Authorization) dbgHeaders.Authorization = 'Bearer ***'
    if (dbgHeaders['X-Api-Key']) dbgHeaders['X-Api-Key'] = '***'
    console.info('[Apollo DEBUG company-search] →', { url: urlWithQs, headers: dbgHeaders })
  }

  try {
    // search
    let resp = await searchCall(headers)
    if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
      await tryRefresh()
      resp = await searchCall(headers)
    }
    const raw = await resp.text()
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Apollo error: ${resp.status} ${resp.statusText}`, details: raw?.slice(0, 2000) },
        { status: resp.status || 400 },
      )
    }

    let data: any = {}
    try { data = raw ? JSON.parse(raw) : {} } catch { data = {} }
    if (typeof data === 'string') { try { data = JSON.parse(data) } catch { data = {} } }

    const arr: any[] = Array.isArray(data?.organizations)
      ? data.organizations
      : Array.isArray(data?.companies)
        ? data.companies
        : []

    type Company = {
      id: string
      name: string | null
      location: string | null
      website_url: string | null
      linkedin_url: string | null
      short_description: string | null
      job_postings?: Array<{
        id: string
        title: string | null
        location: string | null
        posted_at: string | null
        url: string | null
        source: string | null
        raw?: any
      }>
      raw: any
    }

    const companiesUnfiltered: Company[] = arr.map((o: any) => {
      const id = (o?.id ?? o?._id ?? '').toString()
      const name =
        (o?.name && String(o.name).trim()) ||
        (o?.organization && typeof o.organization.name === 'string' && o.organization.name.trim()) ||
        null

      const website_url =
        (typeof o?.website_url === 'string' && o.website_url) ||
        (typeof o?.domain === 'string' && o.domain ? `https://${o.domain}` : null) ||
        null

      const linkedin_url =
        (typeof o?.linkedin_url === 'string' && o.linkedin_url) ||
        (typeof o?.linkedin_profile_url === 'string' && o.linkedin_profile_url) ||
        null

      const exact_location =
        (typeof o?.exact_location === 'string' && o.exact_location.trim()) ||
        (typeof o?.location === 'string' && o.location.trim()) ||
        null

      const city =
        (typeof o?.city === 'string' && o.city) ||
        (typeof o?.location_city === 'string' && o.location_city) ||
        null

      const state =
        (typeof o?.state === 'string' && o.state) ||
        (typeof o?.location_state === 'string' && o.location_state) ||
        null

      const country =
        (typeof o?.country === 'string' && o.country) ||
        (typeof o?.location_country === 'string' && o.location_country) ||
        null

      const location = exact_location || [city, state, country].filter(Boolean).join(', ') || null

      const short_description =
        (typeof o?.short_description === 'string' && o.short_description) ||
        (typeof o?.summary === 'string' && o.summary) ||
        null

      return { id, name, location, website_url, linkedin_url, short_description, raw: o }
    })

    // enrichment (industries) to exclude staffing/recruiting
    const ids = companiesUnfiltered.map(c => c.id).filter(Boolean)

    // run all in parallel (well within Apollo limits)
    const details = await Promise.all(ids.map(orgId => fetchOrganizationDetail(orgId, headers, tryRefresh)))

    const excluded: string[] = []
    const keep = new Set<string>()
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const detail = details[i]
      if (!detail) { keep.add(id); continue }
      const industryNames = extractIndustryNames(detail)
      if (isStaffingRecruitmentIndustry(industryNames)) excluded.push(id)
      else keep.add(id)
    }

    let companies = companiesUnfiltered.filter(c => keep.has(c.id))

    // fetch job postings for remaining companies (up to 10 per org)
    const postings = await Promise.all(
      companies.map(c => fetchOrganizationJobPostings(c.organization_id || c.id, headers, tryRefresh, 10))
    )
    
    companies = companies.map((c, idx) => ({
      ...c,
      job_postings: postings[idx] ?? []
    }))

    return NextResponse.json({
      meta: { page, per_page, count: companies.length, excluded: excluded.length },
      pagination: data?.pagination ?? { page, per_page },
      breadcrumbs: data?.breadcrumbs ?? [],
      companies,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error during Apollo request', details: String(err) },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/apollo/company-search with a JSON body.' },
    { status: 405 },
  )
}

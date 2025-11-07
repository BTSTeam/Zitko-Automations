// app/api/apollo/company-search/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { refreshApolloAccessToken } from '@/lib/apolloRefresh'

const APOLLO_PEOPLE_SEARCH_URL = 'https://api.apollo.io/api/v1/mixed_people/search'

/* ------------------------------- utils -------------------------------- */
function toArray(v?: string[] | string): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map((s) => s.trim()).filter(Boolean)
  return String(v).split(',').map((s) => s.trim()).filter(Boolean)
}
function buildQS(params: Record<string, string[] | string>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x))
    else if (v !== undefined && v !== null && String(v).length) p.append(k, String(v))
  }
  return p.toString()
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10) }
function dateNDaysAgoYMD(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return ymd(d)
}
function todayYMD(): string { return ymd(new Date()) }

/* -------------------- tech labels + slug normalisation -------------------- */
// Hard-coded technology labels (human-readable). We’ll convert to Apollo slugs.
const HARD_CODED_TECH_LABELS: string[] = [
  "AcquireTM","ADP Applicant Tracking System","Applicant Pro","Ascendify","ATS OnDemand","Avature",
  "Avionte","BambooHR","Bond Adapt","Breezy HR (formerly NimbleHR)","Catsone","Compas (MyCompas)",
  "Cornerstone On Demand","Crelate","Employease","eRecruit","Findly","Gethired","Gild","Greenhouse.io",
  "HealthcareSource","HireBridge","HR Logix","HRMDirect","HRSmart","Hyrell","iCIMS","Indeed Sponsored Ads",
  "Infor (PeopleAnswers)","Interviewstream","JobAdder","JobApp","JobDiva","Jobscore","Jobvite","Kenexa",
  "Kwantek","Lever","Luceo","Lumesse","myStaffingPro","myTalentLink","Newton Software","PC Recruiter",
  "People Matter","PeopleFluent","Resumator","Sendouts","SilkRoad","SmartRecruiters","SmashFly",
  "SuccessFactors (SAP)","TalentEd","Taleo","TMP Worldwide","TrackerRMS","UltiPro","Umantis","Winocular",
  "Workable","Workday Recruit","ZipRecruiter","Zoho Recruit","Vincere","Bullhorn",
]

// Convert to Apollo slug format: lowercase, underscores, minimal punctuation.
function toTechSlug(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\(formerly [^)]+\)/g, '')
    .replace(/&/g, ' and ')
    .replace(/[./\s+-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
}
function normaliseToSlugs(values: string[]): string[] {
  return Array.from(new Set(values.map(v => toTechSlug(v)).filter(Boolean)))
}

/* --------------------------------- API --------------------------------- */
export async function POST(req: NextRequest) {
  const urlObj = new URL(req.url)
  const DEBUG = (urlObj.searchParams.get('debug') === '1') ||
                ((req.headers.get('x-debug-apollo') || '').trim() === '1')

  // Parse body
  let body: any = {}
  try { body = await req.json() } catch {}

  // Inputs from UI
  const locations      = toArray(body.locations)        // e.g., ["London, United Kingdom"]
  const keywords       = toArray(body.keywords)         // e.g., ["Security","Fire","CCTV"]
  const employeeRanges = toArray(body.employeeRanges)   // e.g., ["1,1000"] or multiple
  const employeesMin   = body.employeesMin === '' || body.employeesMin == null ? null : Number(body.employeesMin)
  const employeesMax   = body.employeesMax === '' || body.employeesMax == null ? null : Number(body.employeesMax)
  const activeJobsOnly = Boolean(body.activeJobsOnly)
  const activeJobsDays = Number.isFinite(Number(body.activeJobsWindowDays ?? body.activeJobsDays))
    ? Math.max(1, Math.floor(Number(body.activeJobsWindowDays ?? body.activeJobsDays)))
    : 0

  // tech exclusions: body override -> env -> hard-coded
  const techFromBody = Array.isArray(body?.technology_uids) ? body.technology_uids : []
  const techFromEnv = String(process.env.APOLLO_TECH_EXCLUSION_UIDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const techSource = techFromBody.length ? techFromBody
                  : techFromEnv.length  ? techFromEnv
                  : HARD_CODED_TECH_LABELS
  const TECH_UIDS = normaliseToSlugs(techSource)

  if (!TECH_UIDS.length) {
    return NextResponse.json({ error: 'No technologies provided for exclusion.' }, { status: 400 })
  }

  // Auth: Apollo OAuth token OR API key
  const session   = await getSession()
  const userKey   = session.user?.email || session.sessionId || ''
  let accessToken = session.tokens?.apolloAccessToken
  const apiKey    = process.env.APOLLO_API_KEY

  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: 'Not authenticated: missing Apollo OAuth token or APOLLO_API_KEY' },
      { status: 401 },
    )
  }

  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    }
    if (accessToken) h.Authorization = `Bearer ${accessToken}`
    else if (apiKey) h['X-Api-Key'] = apiKey
    return h
  }

  // Build Apollo query string (ONLY mixed_people search)
  const baseQS: Record<string, string[] | string> = {
    ...(locations.length ? { 'organization_locations[]': locations } : {}),
    q_keywords: [...keywords, 'Security & Investigations'].filter(Boolean).join(', '),
    'person_seniorities[]': ['owner','founder','c_suite','partner','vp','head','director'],
    'currently_not_using_any_of_technology_uids[]': TECH_UIDS,
    page: '1',
    per_page: '25', // <-- fixed to 25 as requested
  }

  // Prefer ranges[] when both min & max exist or when UI supplied ranges[]
  const ranges: string[] = []
  if (employeesMin != null && employeesMax != null) ranges.push(`${employeesMin},${employeesMax}`)
  for (const r of employeeRanges) if (r && typeof r === 'string') ranges.push(r)
  if (ranges.length) {
    baseQS['organization_num_employees_ranges[]'] = ranges
  } else {
    if (employeesMin != null) baseQS['organization_num_employees_range[min]'] = String(employeesMin)
    if (employeesMax != null) baseQS['organization_num_employees_range[max]'] = String(employeesMax)
  }

  if (activeJobsOnly && activeJobsDays > 0) {
    baseQS['organization_num_jobs_range[min]'] = '1'
    baseQS['organization_job_posted_at_range[min]'] = dateNDaysAgoYMD(activeJobsDays)
    baseQS['organization_job_posted_at_range[max]'] = todayYMD()
  }

  const url = `${APOLLO_PEOPLE_SEARCH_URL}?${buildQS(baseQS)}`

  const call = async () => fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({}), // Apollo expects POST even for search
    cache: 'no-store',
  })

  // One retry on token refresh if needed
  let resp = await call()
  if ((resp.status === 401 || resp.status === 403) && accessToken && userKey) {
    const refreshed = await refreshApolloAccessToken(userKey)
    if (refreshed) {
      const s2 = await getSession()
      accessToken = s2.tokens?.apolloAccessToken
      resp = await call()
    }
  }

  const raw = await resp.text()
  if (!resp.ok) {
    return NextResponse.json(
      { error: `Apollo people search ${resp.status}`, details: raw?.slice(0, 2000), debug: DEBUG ? { url } : undefined },
      { status: resp.status || 400 },
    )
  }

  // Safely parse and normalise to a single "people" array
  let data: any = {}
  try { data = raw ? JSON.parse(raw) : {} } catch { data = {} }
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { data = {} }
  }
  const arr: any[] = Array.isArray(data?.contacts) ? data.contacts
                 : Array.isArray(data?.people)   ? data.people
                 : []

  // Return only the first 25 (per_page already limits, but safe to slice)
  const people = arr.slice(0, 25)

  const out: any = { people, page: 1, per_page: 25 }
  if (DEBUG) out.debug = { url }
  return NextResponse.json(out)
}

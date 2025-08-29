// app/api/match/run/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

type RunReq = {
  jobId?: string
  job?: {
    title?: string
    location?: string
    skills?: string[]
    qualifications?: string[]
    description?: string
  }
  limit?: number
}

const safeArr = (v: any): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []

const resolveJob = async (session: any, body: RunReq, idToken: string) => {
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  if (body.job) return body.job
  if (!body.jobId) return null
  const url = `${base}/api/v2/position/${encodeURIComponent(body.jobId)}`
  const call = () =>
    fetch(url, {
      headers: { 'id-token': idToken, 'x-api-key': config.VINCERE_API_KEY },
      cache: 'no-store',
    })
  let resp = await call()
  if (resp.status === 401 || resp.status === 403) {
    if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
      resp = await call()
    }
  }
  if (!resp.ok) return null
  const pos = await resp.json().catch(() => ({}))
  return {
    title: pos.job_title || pos.title || pos.name || '',
    location:
      pos['location-text'] ||
      pos.location_text ||
      pos.location ||
      pos.city ||
      '',
    skills: Array.isArray(pos.skills)
      ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean)
      : [],
    qualifications: Array.isArray(pos.qualifications)
      ? pos.qualifications.map((q: any) => q?.name ?? q).filter(Boolean)
      : [],
    description: String(
      pos.public_description || pos.publicDescription || pos.description || ''
    ),
  }
}

// Build candidate search URL with matrix vars and optional skill clauses
function buildSearchUrl(
  base: string,
  title: string,
  skillSet: string[],
  limit: number
) {
  const baseUrl = base.replace(/\/$/, '')
  const titlePlus = title.trim().split(/\s+/).join('+')
  const flFields = [
    'id',
    'first_name',
    'last_name',
    'current_job_title',
    'current_location_name',
    'employment_type',
    'linkedin',
    'linkedin_url',
    'skill',
    'keyword',
    'keywords',
    'company',
    'company_name',
    'current_company',
    'current_company_name',
    'current_employer',
    'employer_name',
  ].join(',')
  const matrixSegment = encodeURIComponent(
    `fl=${flFields};sort=created_date asc`
  )
  const titleQ = `current_job_title:%22${titlePlus}%22%23`
  let skillQ = ''
  const skills = (skillSet || []).map((s) => s.trim()).filter(Boolean)
  if (skills.length) {
    const parts: string[] = []
    for (const s of skills) {
      const one = s.split(/\s+/).join('+')
      parts.push(`skill:%22${one}%22`)
      parts.push(`keyword:%22${one}%22`)
    }
    const orJoined = parts.join('%20OR%20')
    skillQ = `${orJoined}%23`
  }
  const url = new URL(
    `${baseUrl}/api/v2/candidate/search/${matrixSegment}`
  )
  url.searchParams.set('limit', String(limit))
  url.searchParams.append('q', titleQ)
  if (skillQ) url.searchParams.append('q', skillQ)
  return url.toString()
}

type RawCand = {
  id: string
  firstName?: string
  lastName?: string
  fullName?: string
  title?: string
  employmentType?: string
  location?: string
  linkedin?: string | null
  employer?: string | null
  skills?: string[]
  keywords?: string[]
}

function pickEmployer(c: any): string | null {
  return (
    c.current_company_name ||
    c.current_company ||
    c.company_name ||
    c.company ||
    c.current_employer ||
    c.employer_name ||
    null
  )
}

function normalizeCand(c: any): RawCand {
  const skills = Array.isArray(c.skill)
    ? c.skill.filter(Boolean)
    : c.skill
    ? [c.skill]
    : []
  const keywordsSrc = Array.isArray(c.keywords)
    ? c.keywords
    : c.keyword
    ? [c.keyword]
    : []
  const keywords = keywordsSrc.filter(Boolean)
  const li = c.linkedin_url ?? c.linkedin ?? null
  return {
    id: String(c.id ?? c.candidate_id ?? ''),
    firstName: c.first_name ?? '',
    lastName: c.last_name ?? '',
    fullName: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    title: c.current_job_title ?? '',
    employmentType: c.employment_type ?? '',
    location: c.current_location_name ?? '',
    linkedin: li,
    employer: pickEmployer(c),
    skills,
    keywords,
  }
}

async function fetchOnce(url: string, idToken: string) {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'id-token': idToken,
    'x-api-key': config.VINCERE_API_KEY,
  }
  const r = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
  })
  return r
}

export async function POST(req: NextRequest) {
  requiredEnv()
  const body: RunReq = await req.json().catch(() => ({} as any))
  const limitPerSearch = Math.min(
    Math.max(Number(body.limit ?? 100), 1),
    300
  )

  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) {
    return NextResponse.json(
      { error: 'Not authenticated with Vincere' },
      { status: 401 }
    )
  }

  // Resolve job from ID or direct payload
  const job = await resolveJob(session, body, idToken)
  if (!job || !job.title?.trim()) {
    return NextResponse.json(
      { error: 'Missing job title' },
      { status: 400 }
    )
  }

  const base = config.VINCERE_TENANT_API_BASE
  const skillsAll = safeArr(job.skills)
  const s4 = skillsAll.slice(0, 4)
  const s3 = skillsAll.slice(0, 3)
  const s2 = skillsAll.slice(0, 2)
  const s1 = skillsAll.slice(0, 1)

  // Five searches: title-only, +4 skills, +3 skills, +2 skills, +1 skill
  const urls: string[] = [
    buildSearchUrl(base, job.title!, [], limitPerSearch),
    buildSearchUrl(base, job.title!, s4, limitPerSearch),
    buildSearchUrl(base, job.title!, s3, limitPerSearch),
    buildSearchUrl(base, job.title!, s2, limitPerSearch),
    buildSearchUrl(base, job.title!, s1, limitPerSearch),
  ]

  const dedup = new Map<string, RawCand>()

  for (const url of urls) {
    let resp = await fetchOnce(url, idToken)
    if (resp.status === 401 || resp.status === 403) {
      const who = session.user?.email || session.sessionId || ''
      if (await refreshIdToken(who)) {
        const s2 = await getSession()
        idToken = s2.tokens?.idToken || idToken
        resp = await fetchOnce(url, idToken)
      }
    }
    if (!resp.ok) continue
    const data = await resp.json().catch(() => ({}))
    const items: any[] = data.result?.items || data.items || []
    for (const raw of items) {
      const c = normalizeCand(raw)
      if (!c.id) continue
      if (!dedup.has(c.id)) dedup.set(c.id, c)
    }
  }

  const allCandidates = Array.from(dedup.values())

  // Call AI to score and filter. Use req.nextUrl.origin for absolute URL.
  const aiUrl = `${req.nextUrl.origin}/api/ai/analyze`
  const aiResp = await fetch(aiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job: {
        title: job.title ?? '',
        location: job.location ?? '',
        skills: skillsAll,
        qualifications: safeArr(job.qualifications),
        description: job.description ?? '',
      },
      candidates: allCandidates.map((c) => ({
        candidate_id: c.id,
        full_name:
          c.fullName ||
          `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
        location: c.location || '',
        current_job_title: c.title || '',
        current_employer: c.employer || '',
        linkedin_url: c.linkedin || '',
        skills: c.skills || [],
        keywords: c.keywords || [],
      })),
      instruction:
        'Deduplicate by candidate_id, score all, prioritize location first, then skills, then qualifications, then current title. Exclude scores below 60.',
    }),
  })

  let ranked: {
    ranked?: { candidate_id: string; score_percent: number; reason: string }[]
  } = {}
  try {
    const text = await aiResp.text()
    ranked = JSON.parse(text)
  } catch {
    ranked = {}
  }

  // Map back, enforce ≥ 60% suitability
  const byId = new Map(allCandidates.map((c) => [c.id, c]))
  const scoredRows = (ranked.ranked || [])
    .map((r) => {
      const c = byId.get(String(r.candidate_id))
      const name =
        c?.fullName ||
        `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() ||
        String(r.candidate_id)
      return {
        id: String(r.candidate_id),
        name,
        title: c?.title || '',
        employer: c?.employer || '',
        linkedin: c?.linkedin || '',
        location: c?.location || '',
        score: Math.round(Number(r.score_percent) || 0),
        reason: r.reason || '',
      }
    })
    .filter((row) => row.score >= 60)

  return NextResponse.json({
    job,
    total: scoredRows.length,
    results: scoredRows,
  })
}

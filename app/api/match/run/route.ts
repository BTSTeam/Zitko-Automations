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

const resolveJob = async (session: any, body: RunReq, idToken: string) => {
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  if (body.job) return body.job
  if (!body.jobId) return null
  const url = `${base}/api/v2/position/${encodeURIComponent(body.jobId)}`
  const call = () =>
    fetch(url, {
      headers: {
        'id-token': idToken,
        'x-api-key': config.VINCERE_API_KEY
      },
      cache: 'no-store'
    })
  let resp = await call()
  if (resp.status === 401 || resp.status === 403) {
    if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
      const s2 = await getSession()
      resp = await call()
      idToken = s2.tokens?.idToken || idToken
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
      pos.public_description ||
        pos.publicDescription ||
        pos.description ||
        ''
    )
  }
}

export async function POST(req: NextRequest) {
  requiredEnv()
  const body: RunReq = await req.json().catch(() => ({} as any))
  const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 100)

  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) {
    return NextResponse.json(
      { error: 'Not authenticated with Vincere' },
      { status: 401 }
    )
  }

  const job = await resolveJob(session, body, idToken)
  if (!job || !job.title?.trim()) {
    return NextResponse.json({ error: 'Missing job title' }, { status: 400 })
  }

  // Title with + (e.g., Security+Engineer) and enforce exact match with #
  const titlePlus = job.title.trim().split(/\s+/).join('+')
  const titleExact = `current_job_title:"${titlePlus}"#`

  // Normalise skills to string[]
  const skills: string[] = Array.isArray(job.skills)
    ? job.skills.map((x: any) => String(x)).filter(Boolean)
    : []

  // Build q param: exact title THEN at least 2 of the skills
  const skillsPart =
    skills.length > 0
      ? ` AND ((` + skills.map((s: string) => `skills:"${s.replace(/"/g, '\\"')}"`).join(' OR ') + `)~2)`
      : ''

  const qRaw = `(${titleExact})${skillsPart}`

  // Encode, but keep '+' literal in title (avoid %2B)
  const qEncoded = encodeURIComponent(qRaw).replace(/%2B/g, '+')

  // Fields to retrieve (including id and education)
  const flFields = [
    'id',
    'first_name',
    'last_name',
    'current_location_name',
    'current_job_title',
    'linkedin',
    'edu_qualification',
    'edu_degree',
    'edu_course',
    'edu_institution',
    'edu_training'
  ].join(',')

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const searchUrl = `${base}/api/v2/candidate/search/fl=${flFields}&sort=created_date%20desc&q=${qEncoded}&limit=${limit}#`

  const headers: Record<string, string> = {
    accept: 'application/json',
    'id-token': idToken,
    'x-api-key': config.VINCERE_API_KEY
  }

  let resp = await fetch(searchUrl, {
    method: 'GET',
    headers,
    cache: 'no-store'
  })
  if (resp.status === 401 || resp.status === 403) {
    const who = session.user?.email || session.sessionId || ''
    if (await refreshIdToken(who)) {
      const s2 = await getSession()
      idToken = s2.tokens?.idToken || idToken
      headers['id-token'] = idToken
      resp = await fetch(searchUrl, {
        method: 'GET',
        headers,
        cache: 'no-store'
      })
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return NextResponse.json(
      { error: 'Vincere search failed', detail: text, searchUrl },
      { status: resp.status }
    )
  }

  const data = await resp.json().catch(() => ({}))
  const items: any[] = data.result?.items || data.items || []

  const toArray = (v: any) =>
    Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []

  const results = items.map((c) => ({
    id: c.id ?? c.candidate_id ?? '',
    firstName: c.first_name ?? '',
    lastName: c.last_name ?? '',
    fullName: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    title: c.current_job_title ?? '',
    employmentType: c.employment_type ?? '',
    linkedin: c.linkedin ?? null,
    skills: toArray(c.skill),
    keywords: toArray(c.keywords),
    location: c.current_location_name ?? '',
    eduQualification: c.edu_qualification ?? '',
    eduDegree: c.edu_degree ?? '',
    eduCourse: c.edu_course ?? '',
    eduInstitution: c.edu_institution ?? '',
    eduTraining: c.edu_training ?? ''
  }))

  return NextResponse.json({
    job,
    results,
    total: results.length,
    searchUrl
  })
}

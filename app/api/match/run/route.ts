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

// --- helper: turn a raw location string into city-only ---
function extractCity(location?: string): string {
  if (!location) return ''
  let city = location.split(',')[0].trim()
  city = city.replace(/\b(North|South|East|West|Northeast|Northwest|Southeast|Southwest)\b/gi, ' ').trim()
  city = city.replace(/\s{2,}/g, ' ').trim()
  if (/london/i.test(location)) return 'London'
  return city
}

// "Security Engineer" -> "Security+Engineer"
function plusJoin(s?: string) {
  return (s || '').trim().replace(/\s+/g, '+')
}

// q builder: current_job_title:"Title"# AND current_city:"City"# AND (skill:S1# AND skill:S2#)
function buildQ(title: string, city: string, skills: string[]) {
  const parts: string[] = []
  if (title) parts.push(`current_job_title:"${title}"#`)
  if (city) parts.push(`current_city:"${city}"#`)
  const s = skills.filter(Boolean).slice(0, 2)
  if (s.length === 2) parts.push(`(skill:${s[0]}# AND skill:${s[1]}#)`)
  else if (s.length === 1) parts.push(`(skill:${s[0]}#)`)
  return parts.join(' AND ')
}

// Encode like your working cURL (keep '+' for our space replacements)
function encodeForQ(raw: string) {
  return encodeURIComponent(raw).replace(/%20/g, '+').replace(/%2B/g, '+')
}

const resolveJob = async (session: any, body: RunReq, idToken: string) => {
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  if (body.job) {
    return { ...body.job, location: extractCity(body.job.location || '') }
  }
  if (!body.jobId) return null

  const url = `${base}/api/v2/position/${encodeURIComponent(body.jobId)}`
  const call = () =>
    fetch(url, {
      headers: { 'id-token': idToken, 'x-api-key': config.VINCERE_API_KEY },
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

  const rawLocation = String(
    (pos as any)['location-text'] ||
    (pos as any).location_text ||
    (pos as any).location ||
    (pos as any).city ||
    ''
  ).trim()

  return {
    title: (pos as any).job_title || (pos as any).title || (pos as any).name || '',
    location: extractCity(rawLocation),
    skills: Array.isArray((pos as any).skills)
      ? (pos as any).skills.map((s: any) => s?.name ?? s).filter(Boolean)
      : [],
    qualifications: Array.isArray((pos as any).qualifications)
      ? (pos as any).qualifications.map((q: any) => q?.name ?? q).filter(Boolean)
      : [],
    description: String(
      (pos as any).public_description ||
      (pos as any).publicDescription ||
      (pos as any).description ||
      ''
    )
  }
}

export async function POST(req: NextRequest) {
  requiredEnv()
  const body: RunReq = await req.json().catch(() => ({} as any))
  const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 100)

  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) {
    return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })
  }

  const job = await resolveJob(session, body, idToken)
  if (!job || !job.title?.trim()) {
    return NextResponse.json({ error: 'Missing job title' }, { status: 400 })
  }

  const titlePlus = plusJoin(job.title)
  const cityPlus = plusJoin(job.location || '')
  const skillPluses = (job.skills || []).map(plusJoin)

  // EXACT requested fields + ascending created_date sort
  const flFields = [
    'id',
    'first_name',
    'last_name',
    'current_location_name',
    'current_job_title',
    'linkedin',
    'keywords',
    'skill',
    'edu_qualification',
    'edu_degree',
    'edu_course',
    'edu_institution',
    'edu_training'
  ].join(',')
  const matrixSegment = encodeURIComponent(`fl=${flFields};sort=created_date asc`)

  // q param (spaces as '+', rest URL-encoded)
  const qRaw = buildQ(titlePlus, cityPlus, skillPluses)
  const qParam = encodeForQ(qRaw)

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const searchUrl = `${base}/api/v2/candidate/search/${matrixSegment}?q=${qParam}&limit=${limit}`

  const API_KEY = (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY
  const headers: Record<string, string> = {
    accept: 'application/json',
    'id-token': idToken,
    'x-api-key': API_KEY
  }

  console.info('[candidate.search] calling', { url: searchUrl })

  let resp = await fetch(searchUrl, { method: 'GET', headers, cache: 'no-store' })
  if (resp.status === 401 || resp.status === 403) {
    const who = session.user?.email || session.sessionId || ''
    if (await refreshIdToken(who)) {
      const s2 = await getSession()
      idToken = s2.tokens?.idToken || idToken
      headers['id-token'] = idToken
      resp = await fetch(searchUrl, { method: 'GET', headers, cache: 'no-store' })
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.error('[candidate.search] non-OK', { status: resp.status, detail: text?.slice(0, 500) })
    return NextResponse.json(
      { error: 'Vincere search failed', detail: text },
      { status: resp.status }
    )
  }

  const data = await resp.json().catch(() => ({}))
  const items: any[] = (data as any).result?.items || (data as any).items || []
  console.info('[candidate.search] ok', {
    status: resp.status,
    count: Array.isArray(items) ? items.length : 0
  })

  const toArray = (v: any) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [])

  const results = items.map((c) => ({
    id: (c as any).id ?? (c as any).candidate_id ?? '',
    firstName: (c as any).first_name ?? '',
    lastName: (c as any).last_name ?? '',
    fullName: `${(c as any).first_name ?? ''} ${(c as any).last_name ?? ''}`.trim(),
    title: (c as any).current_job_title ?? '',
    linkedin: (c as any).linkedin ?? null,
    skills: toArray((c as any).skill),
    keywords: toArray((c as any).keywords),
    location: (c as any).current_location_name ?? '',
    eduQualification: (c as any).edu_qualification ?? '',
    eduDegree: (c as any).edu_degree ?? '',
    eduCourse: (c as any).edu_course ?? '',
    eduInstitution: (c as any).edu_institution ?? '',
    eduTraining: (c as any).edu_training ?? ''
  }))

  return NextResponse.json({ job, results, total: results.length })
}

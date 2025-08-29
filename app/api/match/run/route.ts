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
  limit?: number // limit per search
}

const toArray = (v: any) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [])
const safeArr = (v: any): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []

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
    )
  }
}

// Build the candidate search URL.
// - Always includes title query
// - Optionally adds an OR group for up to 4 skills (searching both `skill` and `keyword`)
function buildSearchUrl(base: string, title: string, skills4: string[], limit: number) {
  const baseUrl = base.replace(/\/$/, '')
  const titlePlus = title.trim().split(/\s+/).join('+')

  const flFields = [
    'id',
    'first_name',
    'last_name',
    'current_job_title',
    'employment_type',
    'linkedin',
    'skill',
    'keywords',
    'current_location_name',
    'edu_qualification',
    'edu_degree',
    'edu_course',
    'edu_institution',
    'edu_training'
  ].join(',')

  const matrixSegment = encodeURIComponent(`fl=${flFields};sort=created_date asc`)
  const url = new URL(`${baseUrl}/api/v2/candidate/search/${matrixSegment}`)

  // Title clause (SOLR style, end with '#')
  const titleQ = `current_job_title:%22${titlePlus}%22%23`
  url.searchParams.append('q', titleQ)
  url.searchParams.set('limit', String(limit))

  // Optional skills clause (OR across skill + keyword)
  const skills = skills4.map(s => s.trim()).filter(Boolean)
  if (skills.length) {
    const parts: string[] = []
    for (const s of skills) {
      const one = s.split(/\s+/).join('+')
      parts.push(`skill:%22${one}%22`)
      parts.push(`keyword:%22${one}%22`)
    }
    const orJoined = parts.join('%20OR%20')
    const skillsQ = `${orJoined}%23`
    url.searchParams.append('q', skillsQ)
  }

  return url.toString()
}

async function fetchWithRefresh(url: string, session: any, idToken: string) {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'id-token': idToken,
    'x-api-key': config.VINCERE_API_KEY
  }
  let resp = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
  if (resp.status === 401 || resp.status === 403) {
    const who = session.user?.email || session.sessionId || ''
    if (await refreshIdToken(who)) {
      const s2 = await getSession()
      const newId = s2.tokens?.idToken || idToken
      headers['id-token'] = newId
      resp = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
      return { resp, idToken: newId }
    }
  }
  return { resp, idToken }
}

export async function POST(req: NextRequest) {
  requiredEnv()
  const body: RunReq = await req.json().catch(() => ({} as any))
  const perSearchLimit = Math.min(Math.max(Number(body.limit ?? 100), 1), 100)

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

  const base = config.VINCERE_TENANT_API_BASE
  const skillsAll = safeArr(job.skills)
  const top4 = skillsAll.slice(0, 4)

  // --- Search A: original (title-only) ---
  const urlA = buildSearchUrl(base, job.title!, [], perSearchLimit)
  let a = await fetchWithRefresh(urlA, session, idToken)
  idToken = a.idToken
  if (!a.resp.ok) {
    const text = await a.resp.text().catch(() => '')
    return NextResponse.json(
      { error: 'Vincere search (title) failed', detail: text },
      { status: a.resp.status }
    )
  }
  const dataA = await a.resp.json().catch(() => ({}))
  const itemsA: any[] = dataA.result?.items || dataA.items || []

  // --- Search B: title + top 4 skills ---
  const urlB = buildSearchUrl(base, job.title!, top4, perSearchLimit)
  let b = await fetchWithRefresh(urlB, session, idToken)
  idToken = b.idToken
  if (!b.resp.ok) {
    // Don’t hard-fail if B fails: merge only A
    // But include detail for debugging
    const dataOnlyA = itemsA
      .map((c) => ({
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
        eduTraining: c.edu_training ?? '',
        // keep shape stable for dashboard/AI step
        qualifications: [] as string[]
      }))
    return NextResponse.json({
      job,
      results: dataOnlyA,
      total: dataOnlyA.length,
      note: 'Second search (title + 4 skills) failed; returning title-only results.'
    })
  }
  const dataB = await b.resp.json().catch(() => ({}))
  const itemsB: any[] = dataB.result?.items || dataB.items || []

  // --- Combine & de-dupe by Candidate ID ---
  const byId = new Map<string, any>()
  const pushItem = (c: any) => {
    const id = String(c.id ?? c.candidate_id ?? '').trim()
    if (!id || byId.has(id)) return
    byId.set(id, c)
  }
  itemsA.forEach(pushItem)
  itemsB.forEach(pushItem)
  const merged = Array.from(byId.values())

  // --- Normalize to original shape (so UI & AI step don’t break) ---
  const results = merged.map((c) => ({
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
    eduTraining: c.edu_training ?? '',
    // keep an explicit qualifications array for the AI step (even if empty)
    qualifications: [] as string[]
  }))

  return NextResponse.json({
    job,
    results,
    total: results.length
  })
}

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

// --- helpers ---
function esc(str?: string) {
  return String(str ?? '').replace(/"/g, '\\"').trim()
}
function toClause(field: string, value: string) {
  return `${field}:"${esc(value)}"#`
}
function uniq(a: string[] = []) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of a) {
    const t = v.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(t)
    }
  }
  return out
}

// Build q: title AND (any skill in keywords/skill), with sensible fallbacks
function buildQuery(job: NonNullable<RunReq['job']>) {
  const title = (job.title ?? '').trim()
  const titleBlock = title ? toClause('current_job_title', title) : ''

  const skills = uniq(job.skills ?? []).slice(0, 12)
  let skillsBlock = ''
  if (skills.length > 0) {
    const parts: string[] = []
    for (const s of skills) {
      parts.push(toClause('keywords', s))
      parts.push(toClause('skill', s))
    }
    skillsBlock = `(${parts.join(' OR ')})`
  }

  if (titleBlock && skillsBlock) return `(${titleBlock}) AND ${skillsBlock}`
  if (titleBlock) return `(${titleBlock})`
  if (skillsBlock) return skillsBlock
  return '*:*'
}

// Return fields + sort
function buildMatrixVars() {
  const fl = [
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
    'edu_training',
  ].join(',')

  const mlt = 'first_name,last_name'
  const sort = 'created_date asc'
  return `fl=${fl};mlt.fl=${mlt};sort=${sort}`
}

// Resolve job: prefer provided job (already extracted in UI)
async function resolveJob(_session: any, body: RunReq): Promise<RunReq['job'] | null> {
  if (body.job) return body.job
  return null
}

// GET with single auto-refresh retry
async function fetchWithAutoRefresh(url: string, idToken: string, userKey: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {})
  headers.set('id-token', idToken)
  headers.set('x-api-key', config.VINCERE_API_KEY)
  headers.set('accept', 'application/json')

  const doFetch = (h: Headers) => fetch(url, { ...init, headers: h, method: 'GET', cache: 'no-store' })

  // First attempt
  let resp = await doFetch(headers)
  if (resp.status === 401 || resp.status === 403) {
    // Try a single refresh (returns boolean)
    try {
      const refreshed = await refreshIdToken(userKey)
      if (refreshed) {
        // Re-read session to get fresh idToken
        const s2 = await getSession()
        const id2 = s2.tokens?.idToken || ''
        if (id2) {
          headers.set('id-token', id2)
          resp = await doFetch(headers)
        }
      }
    } catch {
      // ignore and fall through to return the original 401/403 response
    }
  }
  return resp
}

export async function POST(req: NextRequest) {
  try {
    requiredEnv()

    const session = await getSession()
    const idToken = session.tokens?.idToken || ''
    const userKey = session.user?.email || session.sessionId || 'anonymous'
    if (!idToken) {
      return NextResponse.json({ error: 'Not connected to Vincere.' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as RunReq
    const job = await resolveJob(session, body)
    if (!job) {
      return NextResponse.json({ error: 'Missing job details.' }, { status: 400 })
    }

    const matrixVars = buildMatrixVars()
    const q = buildQuery(job)
    const limit = Math.max(1, Math.min(100, Number(body.limit ?? 100)))

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const url = `${base}/api/v2/candidate/search/${encodeURIComponent(matrixVars)}?q=${encodeURIComponent(q)}&limit=${limit}`

    const resp = await fetchWithAutoRefresh(url, idToken, userKey)
    const text = await resp.text()
    if (!resp.ok) {
      return NextResponse.json(
        { error: 'Vincere search failed', status: resp.status, detail: text, url },
        { status: 400 }
      )
    }

    // Expected Vincere shape: { count, data: [...] }
    let json: any = {}
    try { json = JSON.parse(text) } catch { json = {} }

    const candidates = Array.isArray(json?.data) ? json.data : []
    const count = Number(json?.count ?? candidates.length ?? 0)

    const results = candidates.map((c: any) => ({
      id: String(c?.id ?? ''),
      first_name: c?.first_name ?? '',
      last_name: c?.last_name ?? '',
      name: [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim(),
      current_job_title: c?.current_job_title ?? '',
      current_location_name: c?.current_location_name ?? '',
      linkedin: c?.linkedin ?? '',
      keywords: c?.keywords ?? [],
      skill: c?.skill ?? [],
      edu_qualification: c?.edu_qualification ?? [],
      edu_degree: c?.edu_degree ?? [],
      edu_course: c?.edu_course ?? [],
      edu_institution: c?.edu_institution ?? [],
      edu_training: c?.edu_training ?? [],
    }))

    return NextResponse.json({
      ok: true,
      query: { q, limit, matrix_vars: matrixVars, url },
      count,
      candidates: results,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

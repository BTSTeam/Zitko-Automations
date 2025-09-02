export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

type RunReq = {
  job?: {
    title?: string
    location?: string
    skills?: string[]
    qualifications?: string[]
    description?: string
  }
  limit?: number
}

const esc = (s?: string) => String(s ?? '').replace(/"/g, '\\"').trim()
const clause = (field: string, value: string) => `${field}:"${esc(value)}"#`

function uniq(a: string[] = []) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of a) {
    const t = (v ?? '').toString().trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(t) }
  }
  return out
}

function cityFrom(loc?: string) {
  if (!loc) return ''
  let s = (loc.split(',')[0] || '').trim().replace(/\s+/g, ' ')
  const qualifier = /^(?:(?:north|south|east|west)(?:\s*[- ]\s*(?:east|west))?|central|centre|greater|inner|outer|city of)\s+/i
  while (qualifier.test(s)) s = s.replace(qualifier, '').trim()
  return s
}

function encodeForVincereQuery(q: string) {
  return encodeURIComponent(q).replace(/%20/g, '+')
}

function buildQuery(job: NonNullable<RunReq['job']>) {
  const title = (job.title ?? '').trim()
  const city  = cityFrom(job.location)
  const titleClause = title ? clause('current_job_title', title) : ''
  const cityClause  = city  ? clause('current_city', city) : ''
  const skills = uniq(job.skills ?? []).slice(0, 2)
  const skillsClause = skills.length
    ? `(${skills.map(s => clause('skill', s)).join(' AND ')})`
    : ''
  let q = ''
  if (titleClause) q = titleClause
  if (cityClause)  q = q ? `${q} AND ${cityClause}` : cityClause
  if (skillsClause) q = q ? `${q} AND ${skillsClause}` : skillsClause
  return q || '*:*'
}

function buildMatrixVars() {
  return 'fl=id,first_name,last_name,current_location_name,current_job_title,linkedin,skill;sort=created_date asc'
}

export async function POST(req: NextRequest) {
  try {
    requiredEnv()
    const session = await getSession()
    const idToken = session.tokens?.idToken || ''
    const userKey = session.user?.email || session.sessionId || 'anonymous'
    if (!idToken) return NextResponse.json({ error: 'Not connected to Vincere.' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as RunReq
    if (!body.job) return NextResponse.json({ error: 'Missing job details.' }, { status: 400 })

    const matrixVars = buildMatrixVars()
    const qRaw = buildQuery(body.job)

    const limit = Math.max(1, Math.min(100, Number(body.limit ?? 100)))
    const start = 0

    const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
    const encodedMatrix = encodeURIComponent(matrixVars)
    const encodedQ = encodeForVincereQuery(qRaw)

    const url = `${base}/api/v2/candidate/search/${encodedMatrix}?q=${encodedQ}&start=${start}&limit=${limit}`

    const headers = new Headers()
    headers.set('id-token', idToken)
    headers.set('x-api-key', config.VINCERE_API_KEY)
    headers.set('accept', 'application/json')

    let resp = await fetch(url, { method: 'GET', headers })
    if (resp.status === 401 || resp.status === 403) {
      await refreshIdToken(userKey)
      const s2 = await getSession()
      const id2 = s2.tokens?.idToken || ''
      headers.set('id-token', id2)
      resp = await fetch(url, { method: 'GET', headers })
    }

    const text = await resp.text()
    let json: any = {}
    try { json = JSON.parse(text) } catch {}

    const result = json?.result
    const rawItems = Array.isArray(result?.items) ? result.items : []

    const toList = (v: any) =>
      Array.isArray(v)
        ? v.map((x) => (typeof x === 'string' ? x : (x?.description ?? x?.value ?? '')))
            .filter(Boolean)
        : []

    const results = rawItems.map((c: any) => ({
      id: String(c?.id ?? ''),
      firstName: c?.first_name ?? '',
      lastName: c?.last_name ?? '',
      fullName: `${c?.first_name ?? ''} ${c?.last_name ?? ''}`.trim(),
      title: c?.current_job_title ?? '',
      location: c?.current_location_name ?? '',
      skills: toList(c?.skill),
      linkedin: c?.linkedin ?? null,
    }))

    return NextResponse.json({
      ok: true,
      query: { matrix_vars: matrixVars, q: qRaw, url, start, limit },
      count: results.length,
      results,
      candidates: results,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

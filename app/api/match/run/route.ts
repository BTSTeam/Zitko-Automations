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

// ---------- NEW: GPT scoring helper ----------
async function scoreWithGPT(job: any, candidates: any[]) {
  const apiKey = process.env.OPENAI_API_KEY || config.OPENAI_API_KEY
  if (!apiKey) return []

  const model = process.env.OPENAI_MODEL || (config as any).OPENAI_MODEL || 'gpt-4o-mini'

  // Keep payload lean for token safety
  const compact = candidates.map(c => ({
    id: c.id,
    name: c.fullName,
    title: c.title,
    location: c.location,
    skills: c.skills?.slice?.(0, 30) ?? c.skills,
    qualifications: [
      c.eduQualification, c.eduDegree, c.eduCourse, c.eduInstitution, c.eduTraining
    ].filter(Boolean),
    linkedin: c.linkedin
  }))

  const sys = `You are a recruitment scorer. Return STRICT JSON ONLY.
Score 0-100 for each candidate based on this weighting:
- Location 50% (same city/area=strong; nearby region=ok; far/mismatch=penalise)
- Skills 35% (match role-specific skills/tech)
- Qualifications 15% (relevant education/certs)
Also include a short human-readable reason (<=220 chars).`

  const user = {
    job,
    candidates: compact
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Job Summary:\n${JSON.stringify(user.job, null, 2)}\n\nCandidates:\n${JSON.stringify(user.candidates, null, 2)}\n\nReturn JSON of shape: {"scores":[{"id":"<id>","score":0-100,"reason":"..."}]}` }
    ],
    temperature: 0.1
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!resp.ok) return []

  const json = await resp.json().catch(() => ({} as any))
  const content = json?.choices?.[0]?.message?.content ?? ''

  let parsed: any = null
  try {
    parsed = JSON.parse(content)
  } catch {
    // attempt to salvage JSON from any stray text
    const m = content.match(/\{[\s\S]*\}/)
    if (m) {
      try { parsed = JSON.parse(m[0]) } catch {}
    }
  }
  const scores = Array.isArray(parsed?.scores) ? parsed.scores : []
  return scores
}
// ---------- END GPT helper ----------

export async function POST(req: NextRequest) {
  requiredEnv()
  const body: RunReq = await req.json().catch(() => ({} as any))
  const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 100)

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

  const titlePlus = job.title.trim().split(/\s+/).join('+')

  // Fields + sort asc
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

  // Exact title with Vincere hash (#)
  const qParam = `current_job_title%3A%22${titlePlus}%22%23`

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const searchUrl = `${base}/api/v2/candidate/search/${matrixSegment}?q=${qParam}&limit=${limit}`

  const headers: Record<string, string> = {
    accept: 'application/json',
    'id-token': idToken,
    'x-api-key': config.VINCERE_API_KEY
  }

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
    return NextResponse.json(
      { error: 'Vincere search failed', detail: text },
      { status: resp.status }
    )
  }

  const data = await resp.json().catch(() => ({}))
  const items: any[] = data.result?.items || data.items || []

  const toArray = (v: any) => Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []

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

  // ---- NEW: Score with GPT, filter >= 50, sort desc ----
let scored = results
try {
  const scores = await scoreWithGPT(job, results)
  const byId = new Map<string, any>(scores.map((s: any) => [String(s.id), s as any]))

  scored = results
    .map(r => {
      const s = byId.get(String(r.id)) as any
      const scoreNum = Math.max(0, Math.min(100, Number(s?.score ?? 0)))
      const reason = typeof s?.reason === 'string' ? s.reason : 'Insufficient data to score'
      return { ...r, score: scoreNum, reason }
    })
    .filter(r => (r as any).score >= 50)
    .sort((a: any, b: any) => b.score - a.score)
} catch {
  // fallback: leave unscored list
}


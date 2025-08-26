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
  page?: number
  limit?: number
  debug?: boolean
}

// ---------- helpers ----------
function esc(s?: string) {
  return (s ?? '').replace(/"/g, '\\"').trim()
}

// single field -> `field:"value"#`
function term(field: string, value?: string) {
  const v = esc(value)
  return v ? `${field}:"${v}"#` : ''
}

// multiple fields -> `(f1:"v"# OR f2:"v"#)`
function termFields(fields: string[], value?: string) {
  const v = esc(value)
  if (!v) return ''
  return `(${fields.map(f => `${f}:"${v}"#`).join(' OR ')})`
}

// one field, many values -> `(f:"a"# OR f:"b"# ...)`
function anyValues(field: string, items: string[]) {
  const list = (items || []).map(esc).filter(Boolean)
  if (!list.length) return ''
  return `(${list.map(v => `${field}:"${v}"#`).join(' OR ')})`
}

// many fields, many values
function anyValuesFields(fields: string[], items: string[]) {
  const list = (items || []).map(esc).filter(Boolean)
  if (!list.length) return ''
  const bits: string[] = []
  for (const f of fields) for (const v of list) bits.push(`${f}:"${v}"#`)
  return `(${bits.join(' OR ')})`
}

function AND(...parts: string[]) { return parts.filter(Boolean).join(' AND ') }

function onlyUnique<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>(), out: T[] = []
  for (const it of arr) { const k = key(it); if (!k || seen.has(k)) continue; seen.add(k); out.push(it) }
  return out
}

function findLinkedIn(d: any): string | null {
  const cands = [d.linkedin, d.linkedIn, d.linkedin_url, d.linkedinUrl, d.social?.linkedin, d.social_links?.linkedin, d.urls?.linkedin, d.contacts?.linkedin].filter(Boolean)
  for (const v of cands) if (typeof v === 'string' && v.includes('linkedin.com')) return v
  const arrays = [d.websites, d.links, d.social, d.social_links].filter(Array.isArray)
  for (const arr of arrays as any[]) {
    const hit = arr.find((x: any) => typeof x === 'string' && x.includes('linkedin.com'))
      || arr.find((x: any) => typeof x?.url === 'string' && x.url.includes('linkedin.com'))
    if (hit) return typeof hit === 'string' ? hit : hit.url
  }
  return null
}

// ---------- route ----------
export async function POST(req: NextRequest) {
  requiredEnv()
  const body = (await req.json().catch(() => ({}))) as RunReq
  const page = Math.max(1, Number(body.page ?? 1))
  const pageSize = Math.min(Math.max(Number(body.limit ?? 20), 1), 50)
  const debug = !!body.debug

  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // 1) Resolve job (by id) if not provided
  let job = body.job
  if (!job && body.jobId) {
    const call = async () =>
      fetch(positionUrl(body.jobId!), {
        headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY },
        cache: 'no-store',
      })
    let r = await call()
    if (r.status === 401 || r.status === 403) {
      if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
        const s2 = await getSession(); idToken = s2.tokens?.idToken; r = await call()
      }
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return NextResponse.json({ error: 'Failed to load position', detail }, { status: r.status || 400 })
    }
    const pos = await r.json()
    job = {
      title: pos.job_title || pos.title || pos.name || '',
      // prefer text; radius search can be added later if you have coords
      location: pos['location-text'] || pos.location_text || pos.location || pos.city || '',
      skills: Array.isArray(pos.skills)
        ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean)
        : typeof pos.keywords === 'string'
          ? pos.keywords.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [],
      description: String(pos.public_description || pos.publicDescription || pos.description || ''),
    }
  }
  if (!job) return NextResponse.json({ error: 'Missing job' }, { status: 400 })

  const title = String(job.title || '')
  const location = String(job.location || '')
  const skills = Array.isArray(job.skills) ? job.skills.map(String) : []
  const qualifications = Array.isArray(job.qualifications) ? job.qualifications.map(String) : []
  const description = String(job.description || '')

  // 2) Supported candidate fields (fixed)
  const TITLE_FIELDS = ['current_job_title', 'job_title'] // removed invalid current_title
  const LOC_FIELDS = ['current_location_name', 'city', 'address', 'state', 'country_code', 'postal_code']
  const SKILL_FIELDS = ['skill', 'keyword'] // singular

  // 3) Strategies (strict → broad)
  const STRATS: { label: string, q: string }[] = [
    { label: 'S1', q: AND(termFields(TITLE_FIELDS, title), termFields(LOC_FIELDS, location), anyValuesFields(SKILL_FIELDS, skills)) },
    { label: 'S2', q: AND(termFields(TITLE_FIELDS, title), termFields(LOC_FIELDS, location)) },
    { label: 'S3', q: AND(termFields(TITLE_FIELDS, title), anyValuesFields(SKILL_FIELDS, skills)) },
    { label: 'S4', q: anyValuesFields(SKILL_FIELDS, skills) },
    { label: 'S5', q: termFields(TITLE_FIELDS, title) },
  ].map(s => ({ ...s, q: s.q || '*:*' }))

  // 4) Return field list (matrix vars)
  const fl = [
    'id',
    'candidate_id',
    'first_name',
    'last_name',
    'current_location_name',
    'current_job_title',
    'skill',
    'keyword',
    'linkedin_url',
  ].join(',')

  // fetch with retry on 401/403
  const headersBase = () => ({ 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY })
  const fetchWithRetry = async (url: string) => {
    let resp = await fetch(url, { headers: headersBase(), cache: 'no-store' })
    if (resp.status === 401 || resp.status === 403) {
      if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
        const s2 = await getSession(); idToken = s2.tokens?.idToken
        resp = await fetch(url, { headers: headersBase(), cache: 'no-store' })
      }
    }
    return resp
  }

  // 5) Run strategies and collect
  const all: any[] = []
  const dbg: any[] = []
  for (const s of STRATS) {
    const matrix = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent('created_date desc')}`
    const limit = Math.min(Math.max(pageSize, 1), 50)
    const url = `${searchBase}/${matrix}?q=${encodeURIComponent(s.q)}&limit=${limit}`

    const resp = await fetchWithRetry(url)
    let docs: any[] = []
    let errorText = ''
    if (resp.ok) {
      const json = await resp.json().catch(() => ({}))
      docs = json?.response?.docs || json?.data || []
      all.push(...docs)
    } else {
      errorText = await resp.text().catch(() => '')
    }

    console.log('[match.run]', s.label, 'q=', s.q, ' status=', resp.status, ' count=', docs.length, errorText ? ` error=${errorText.slice(0, 200)}` : '')
    if (debug) dbg.push({ label: s.la

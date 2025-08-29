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
  debug?: boolean
}

const esc = (s?: string) => (s ?? '').replace(/"/g, '\\"').trim()

function splitTokens(v?: string) {
  if (!v) return [] as string[]
  const stop = new Set(['&', 'and', 'of', 'the', '/', '-', '|', ','])
  return v
    .split(/[,\s/|\-]+/g)
    .map(t => t.trim())
    .filter(t => t && !stop.has(t.toLowerCase()) && t.length >= 2)
}

function phrase(field: string, value?: string) {
  const v = esc(value)
  return v ? `${field}:"${v}"#` : ''
}

function tokensAND(field: string, value?: string) {
  const toks = splitTokens(value)
  if (!toks.length) return ''
  return toks.map(t => `${field}:${esc(t)}#`).map(s => `(${s})`).join(' AND ')
}

export async function POST(req: NextRequest) {
  requiredEnv()

  const body = (await req.json().catch(() => ({}))) as RunReq
  const debug = !!body.debug
  const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 500)

  // auth
  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) {
    return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })
  }

  // endpoints
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // resolve job if only jobId is provided
  let job = body.job
  if (!job && body.jobId) {
    const call = async () =>
      fetch(positionUrl(body.jobId!), {
        headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY },
        cache: 'no-store'
      })

    let r = await call()
    if (r.status === 401 || r.status === 403) {
      if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
        const s2 = await getSession()
        idToken = s2.tokens?.idToken
        r = await call()
      }
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return NextResponse.json({ error: 'Failed to load position', detail }, { status: r.status || 400 })
    }
    const pos = await r.json().catch(() => ({} as any))
    job = {
      title: pos.job_title || pos.title || pos.name || '',
      location: pos['location-text'] || pos.location_text || pos.location || pos.city || '',
      skills: Array.isArray(pos.skills) ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean) : [],
      qualifications: Array.isArray(pos.qualifications) ? pos.qualifications.map((q: any) => q?.name ?? q).filter(Boolean) : [],
      description: String(pos.public_description || pos.publicDescription || pos.description || '')
    }
  }

  const title = esc(job?.title || '')
  if (!title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  // ---------- Queries (progressive widening) ----------
  const titlePhrase = phrase('current_job_title', title)    // current_job_title:"Security Engineer"#
  const textPhrase  = phrase('text', title)                 // text:"Security Engineer"#
  const titleAND    = tokensAND('current_job_title', title) // (current_job_title:Security#) AND (current_job_title:Engineer#)
  const textAND     = tokensAND('text', title)              // (text:Security#) AND (text:Engineer#)

  const attempts = [
    { label: 'titlePhrase',  q: titlePhrase || '*:*' },
    { label: 'textPhrase',   q: textPhrase  || '*:*' },
    { label: 'titleAND',     q: titleAND    || '*:*' },
    { label: 'textAND',      q: textAND     || '*:*' },
    { label: 'titleTokensOR', q: splitTokens(title).map(t => `current_job_title:${esc(t)}#`).join(' OR ') || '*:*' },
    { label: 'textTokensOR',  q: splitTokens(title).map(t => `text:${esc(t)}#`).join(' OR ') || '*:*' },
  ]

  // Returned fields
  const fl = [
    'id','candidate_id','first_name','last_name',
    'current_job_title','current_city','current_location_name',
    'linkedin','linkedin_url',
    'skill','edu_qualification'
  ].join(',')

  const matrix = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent('created_date desc')}`

  const headersBase = () => ({
    accept: 'application/json',
    'id-token': idToken!,
    'x-api-key': config.VINCERE_API_KEY
  })

  async function runAttempt(qStr: string, label: string) {
    const url = `${searchBase}/${matrix}?q=${encodeURIComponent(qStr)}&limit=${limit}`
    console.log('[vincere.search]', label, 'GET', url)
    let resp = await fetch(url, { method: 'GET', headers: headersBase(), cache: 'no-store' })
    if (resp.status === 401 || resp.status === 403) {
      const who = session.user?.email || session.sessionId || ''
      if (await refreshIdToken(who)) {
        const s2 = await getSession()
        idToken = s2.tokens?.idToken
        resp = await fetch(url, { method: 'GET', headers: headersBase(), cache: 'no-store' })
      }
    }
    const ok = resp.ok
    const json = ok ? await resp.json().catch(() => ({} as any)) : null
    const docs = ok ? (json?.response?.docs || json?.data || []) : []
    console.log('[vincere.search]', label, 'status', resp.status, 'count', Array.isArray(docs) ? docs.length : 0)
    return { resp, docs, url, label }
  }

  // Try attempts in order until we get >0 docs (or last attempt)
  let chosen = { resp: null as any, docs: [] as any[], url: '', label: '' }
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]
    const r = await runAttempt(a.q, a.label)
    if ((r.resp?.ok && Array.isArray(r.docs) && r.docs.length > 0) || i === attempts.length - 1) {
      chosen = r
      break
    }
  }

  const resp = chosen.resp
  const docs: any[] = chosen.docs
  const usedUrl = chosen.url

  // Map & dedupe
  const seen = new Set<string>()
  const asArray = (v: any) =>
    Array.isArray(v) ? v :
    (v == null ? [] : String(v).split(/[,;]+/g).map((x: string) => x.trim()).filter(Boolean))

  const results = docs.map(d => {
    const id = String(d.id ?? d.candidate_id ?? '')
    if (!id || seen.has(id)) return null
    seen.add(id)
    return {
      id,
      firstName: d.first_name ?? '',
      lastName: d.last_name ?? '',
      fullName: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim(),
      title: d.current_job_title ?? '',
      city: d.current_city ?? '',
      location: d.current_location_name ?? d.current_location ?? '',
      linkedin: d.linkedin || d.linkedin_url || null,
      skills: asArray(d.skill),
      qualifications: asArray(d.edu_qualification),
    }
  }).filter(Boolean) as any[]

  return NextResponse.json({
    job: job || null,
    results,
    total: results.length,
    ...(debug ? {
      debug: {
        usedUrl,
        status: resp?.status,
        rawCount: docs.length
      },
      rawDocs: docs.slice(0, 5)
    } : {})
  })
}

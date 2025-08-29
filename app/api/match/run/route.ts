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
  job?: { title?: string; location?: string; skills?: string[]; qualifications?: string[]; description?: string }
  limit?: number
  debug?: boolean
}

const esc = (s?: string) => (s ?? '').replace(/"/g, '\\"').trim()
const splitTokens = (v?: string) => {
  if (!v) return [] as string[]
  const stop = new Set(['&','and','of','the','/','-','|',','])
  return v.split(/[,\s/|\-]+/g).map(t => t.trim()).filter(t => t && !stop.has(t.toLowerCase()) && t.length >= 2)
}

export async function POST(req: NextRequest) {
  requiredEnv()

  const body = (await req.json().catch(() => ({}))) as RunReq
  const debug = !!body.debug
  // Vincere docs: limit max is 100:contentReference[oaicite:2]{index=2}
  const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 100)

  // auth
  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  // endpoints
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // resolve job if only jobId provided
  let job = body.job
  if (!job && body.jobId) {
    const call = async () => fetch(positionUrl(body.jobId!), {
      headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY },
      cache: 'no-store'
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
    const pos = await r.json().catch(() => ({}))
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

  // Build query variants — each search term ends with '#':contentReference[oaicite:3]{index=3}
  const tokens = splitTokens(title)
  const qVariants: string[] = []

  // exact phrase in current_job_title
  qVariants.push(`current_job_title:"${title}"#`)
  // AND all tokens
  if (tokens.length) {
    qVariants.push(tokens.map(t => `current_job_title:${t}#`).join(' AND '))
    // OR any token
    qVariants.push(`(${tokens.map(t => `current_job_title:${t}#`).join(' OR ')})`)
    // wildcard AND
    qVariants.push(tokens.map(t => `current_job_title:*${t}*#`).join(' AND '))
  }
  // fallback to full-text field
  qVariants.push(`text:"${title}"#`)

  // restrict returned fields
  const fl = ['id','candidate_id','first_name','last_name','current_job_title'].join(',')

  const matrixA = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent('created_date desc')}`
  const matrixB = encodeURIComponent(`fl=${fl};sort=created_date desc`)

  const headersBase = () => ({
    accept: 'application/json',
    'id-token': idToken!,
    'x-api-key': config.VINCERE_API_KEY
  })

  function buildUrl(style: 'A'|'B'|'C', qStr: string) {
    if (style === 'A') {
      const path = `${searchBase}/${matrixA}`
      return `${path}?q=${encodeURIComponent(qStr)}&limit=${limit}`
    }
    if (style === 'B') {
      const path = `${searchBase}/${matrixB}`
      return `${path}?q=${encodeURIComponent(qStr)}&limit=${limit}`
    }
    // Style C: plain query params
    const params = new URLSearchParams()
    params.set('q', qStr)
    params.set('limit', String(limit))
    params.set('fl', fl)
    params.set('sort', 'created_date desc')
    return `${searchBase}?${params.toString()}`
  }

  async function runOnce(style: 'A'|'B'|'C', qStr: string) {
    const url = buildUrl(style, qStr)
    console.log('[vincere.search]', style, 'GET', url)
    let resp = await fetch(url, { method: 'GET', headers: headersBase(), cache: 'no-store' })
    if (resp.status === 401 || resp.status === 403) {
      const who = session.user?.email || session.sessionId || ''
      if (await refreshIdToken(who)) {
        const s2 = await getSession(); idToken = s2.tokens?.idToken
        resp = await fetch(url, { method: 'GET', headers: headersBase(), cache: 'no-store' })
      }
    }
    const ok = resp.ok
    const json = ok ? await resp.json().catch(() => ({} as any)) : null
    const docs = ok ? (json?.response?.docs || json?.data || []) : []
    console.log('[vincere.search]', style, 'status', resp.status, 'count', Array.isArray(docs) ? docs.length : 0)
    return { resp, docs, url }
  }

  // try each variant across A,B,C until we get docs
  let chosen: { resp: Response | null, docs: any[], url: string, label: string } =
    { resp: null, docs: [], url: '', label: '' }

  outer: for (const q of qVariants) {
    for (const style of ['A','B','C'] as const) {
      const r = await runOnce(style, q)
      if (r.resp?.ok && Array.isArray(r.docs) && r.docs.length > 0) {
        chosen = { ...r, label: `q=${q} style=${style}` }
        break outer
      }
      if (q === qVariants[qVariants.length - 1] && style === 'C') {
        chosen = { ...r, label: `q=${q} style=${style}` }
      }
    }
  }

  const resp = chosen.resp
  const docs: any[] = chosen.docs
  const usedUrl = chosen.url
  const usedLabel = chosen.label

  // map results
  const seen = new Set<string>()
  const results = docs.map(d => {
    const id = String(d.id ?? d.candidate_id ?? '')
    if (!id || seen.has(id)) return null
    seen.add(id)
    return {
      id,
      firstName: d.first_name ?? '',
      lastName: d.last_name ?? '',
      fullName: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim(),
      title: d.current_job_title ?? ''
    }
  }).filter(Boolean) as any[]

  return NextResponse.json({
    job: job || null,
    results,
    total: results.length,
    ...(debug ? {
      debug: {
        usedUrl,
        attempt: usedLabel,
        status: resp?.status,
        rawCount: docs.length
      },
      rawDocs: docs.slice(0, 5)
    } : {})
  })
}

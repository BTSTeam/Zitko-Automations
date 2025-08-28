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
  job?: { title?: string; location?: string; skills?: string[]; description?: string }
  limit?: number
  debug?: boolean
}

/* ---------- helpers ---------- */
const esc = (s?: string) => (s ?? '').replace(/"/g, '\\"').trim()

function splitTokens(v?: string) {
  if (!v) return [] as string[]
  const stop = new Set(['&','and','of','the','/','-','|',','])
  return v.split(/[,\s/|\-]+/g).map(t => t.trim()).filter(t => t && !stop.has(t.toLowerCase()) && t.length >= 2)
}

// (field:"Phrase"#)
function phrase(field: string, value?: string) {
  const v = esc(value); return v ? `${field}:"${v}"#` : ''
}

// ( (field:tok1#) AND (field:tok2#) ... )
function tokensAND(field: string, value?: string) {
  const toks = splitTokens(value); if (!toks.length) return ''
  return toks.map(t => `${field}:${esc(t)}#`).map(s => `(${s})`).join(' AND ')
}

/* ---------- route ---------- */
export async function POST(req: NextRequest) {
  requiredEnv()

  const body = (await req.json().catch(() => ({}))) as RunReq
  const debug = !!body.debug
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100)

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
    const call = async () => fetch(positionUrl(body.jobId!), { headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY }, cache: 'no-store' })
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
      description: String(pos.public_description || pos.publicDescription || pos.description || ''),
    }
  }

  const title = esc(job?.title || '')
  if (!title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  // --- Build a SIMPLE title-only clause:
  // exact current title OR token-AND on current_job_title OR token-AND on text
  const qParts = [
    phrase('current_job_title', title),
    tokensAND('current_job_title', title),
    tokensAND('text', title),
  ].filter(Boolean)
  const q = qParts.length > 1 ? `(${qParts.join(' OR ')})` : (qParts[0] || '*:*')

  // fields to return
  const fl = [
    'id','candidate_id','first_name','last_name',
    'current_job_title','current_city','current_location_name',
    'linkedin','linkedin_url'
  ].join(',')

  // GET helper with token refresh
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

  // one simple query, newest first
  const matrix = `;fl=${encodeURIComponent(fl)};sort=${encodeURIComponent('created_date desc')}`
  const url = `${searchBase}/${matrix}?q=${encodeURIComponent(q)}&limit=${limit}`

  const resp = await fetchWithRetry(url)
  let docs: any[] = []
  let errorText = ''
  if (resp.ok) {
    const json = await resp.json().catch(() => ({}))
    docs = json?.response?.docs || json?.data || []
  } else {
    errorText = await resp.text().catch(() => '')
  }

  console.log('[match.run SIMPLE] q=', q, ' status=', resp.status, ' count=', docs.length, errorText ? ` error=${errorText.slice(0,200)}` : '')

  // map and dedupe
  const seen = new Set<string>()
  const results = docs.map(d => {
    const id = String(d.id ?? d.candidate_id ?? '')
    if (!id || seen.has(id)) return null
    seen.add(id)
    return {
      id,
      firstName: d.first_name ?? '',
      lastName: d.last_name ?? '',
      title: d.current_job_title ?? '',
      city: d.current_city ?? '',
      location: d.current_location_name ?? '',
      linkedin: d.linkedin || d.linkedin_url || null,
    }
  }).filter(Boolean)

  return NextResponse.json({
    results,
    total: results.length,
    ...(debug ? { debug: { q, url, status: resp.status, rawCount: docs.length, error: errorText || undefined } } : {})
  })
}

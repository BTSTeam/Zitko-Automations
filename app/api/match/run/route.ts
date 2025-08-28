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
  job?: { title?: string }
  limit?: number
  debug?: boolean
}

// --- utils ---
const esc = (s?: string) => (s ?? '').replace(/"/g, '\\"').trim()
const splitTokens = (v?: string) =>
  (v || '')
    .split(/[,\s/|\-]+/g)
    .map(t => t.trim())
    .filter(t => t && !['&','and','of','the'].includes(t.toLowerCase()))
const tokensAND = (field: string, value?: string) => {
  const toks = splitTokens(value)
  if (!toks.length) return ''
  return toks.map(t => `${field}:${esc(t)}#`).join(' AND ')
}

export async function POST(req: NextRequest) {
  requiredEnv()

  const body = (await req.json().catch(() => ({}))) as RunReq
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100)
  const debug = !!body.debug

  // --- auth/session
  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // --- resolve job title
  let title = esc(body.job?.title)
  if (!title && body.jobId) {
    const call = async () =>
      fetch(positionUrl(body.jobId!), { headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY }, cache: 'no-store' })
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
    const pos = await r.json().catch(() => ({}))
    title = esc(pos.job_title || pos.title || pos.name || '')
  }
  if (!title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  // --- build search attempts (NO leading ';' in matrix vars)
  const fl = 'first_name,last_name,current_location_name,current_job_title,linkedin'
  const sort = 'created_date desc'
  const matrixNoSemicolon = `fl=${encodeURIComponent(fl)};sort=${encodeURIComponent(sort)}`
  const mkUrl = (q: string, lim = limit) => `${searchBase}/${matrixNoSemicolon}?q=${encodeURIComponent(q)}&limit=${lim}`

  const attempts: { label: string; q: string; url: string }[] = []

  // A) exact phrase on current job title
  const qA = `current_job_title:"${title}"#`
  attempts.push({ label: 'A_exact_current_job_title', q: qA, url: mkUrl(qA) })

  // B) token-AND on current_job_title
  const qB = tokensAND('current_job_title', title)
  if (qB) attempts.push({ label: 'B_tokens_current_job_title', q: qB, url: mkUrl(qB) })

  // C) token-AND on text (fallback when current_job_title is sparse)
  const qC = tokensAND('text', title)
  if (qC) attempts.push({ label: 'C_tokens_text', q: qC, url: mkUrl(qC) })

  const headers = {
    'id-token': idToken!,
    'x-api-key': config.VINCERE_API_KEY,
    accept: 'application/json',
  }

  const fetchWithRetry = async (u: string) => {
    let resp = await fetch(u, { headers, cache: 'no-store' })
    if (resp.status === 401 || resp.status === 403) {
      if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
        const s2 = await getSession()
        const newToken = s2.tokens?.idToken
        if (newToken) {
          resp = await fetch(u, { headers: { ...headers, 'id-token': newToken }, cache: 'no-store' })
        }
      }
    }
    return resp
  }

  let chosen = ''
  let docs: any[] = []
  const runLog: any[] = []

  for (const a of attempts) {
    const resp = await fetchWithRetry(a.url)
    let rows: any[] = []
    let err = ''
    if (resp.ok) {
      const json = await resp.json().catch(() => ({}))
      rows = json?.response?.docs || json?.data || []
    } else {
      err = await resp.text().catch(() => '')
    }
    runLog.push({ label: a.label, status: resp.status, count: rows.length, url: a.url, error: err || undefined })
    if (rows.length > 0) {
      chosen = a.label
      docs = rows
      break
    }
  }

  // optional sanity probe (debug only)
  let probe: any = undefined
  if (debug) {
    const probeUrl = mkUrl('*:*', 1)
    const pr = await fetchWithRetry(probeUrl)
    let cnt = 0, err = ''
    if (pr.ok) {
      const js = await pr.json().catch(() => ({}))
      cnt = (js?.response?.docs || js?.data || []).length
    } else {
      err = await pr.text().catch(() => '')
    }
    probe = { status: pr.status, count: cnt, error: err || undefined, url: probeUrl }
  }

  // map & dedupe
  const seen = new Set<string>()
  const results = (docs || [])
    .map((d: any) => {
      const id = String(d.id ?? d.candidate_id ?? '')
      if (!id || seen.has(id)) return null
      seen.add(id)
      return {
        id,
        firstName: d.first_name ?? '',
        lastName: d.last_name ?? '',
        title: d.current_job_title ?? '',
        location: d.current_location_name ?? '',
        linkedin: d.linkedin ?? d.linkedin_url ?? null,
      }
    })
    .filter(Boolean)

  return NextResponse.json({
    results,
    total: results.length,
    ...(debug ? { debug: { title, chosen, attempts: runLog, probe } } : {}),
  })
}

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

const esc = (s?: string) => (s ?? '').replace(/"/g, '\\"').trim()

export async function POST(req: NextRequest) {
  requiredEnv()

  const body = (await req.json().catch(() => ({}))) as RunReq
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 100)
  const debug = !!body.debug

  // Auth/session
  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // Resolve job title
  let title = esc(body.job?.title)
  if (!title && body.jobId) {
    const call = async () =>
      fetch(positionUrl(body.jobId!), {
        headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY },
        cache: 'no-store',
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
    const pos = await r.json().catch(() => ({}))
    title = esc(pos.job_title || pos.title || pos.name || '')
  }

  if (!title) return NextResponse.json({ error: 'Missing job title' }, { status: 400 })

  // Build request (NO leading ';' before matrix vars)
  const fl = 'first_name,last_name,current_location_name,current_job_title,linkedin'
  const sort = 'created_date desc'
  const q = `current_job_title:"${title}"#`

  // Example final path:
  // /api/v2/candidate/search/fl=first_name,last_name,...;sort=created_date%20desc?q=...
  const matrixNoSemicolon = `fl=${encodeURIComponent(fl)};sort=${encodeURIComponent(sort)}`
  const url = `${searchBase}/${matrixNoSemicolon}?q=${encodeURIComponent(q)}&limit=${limit}`

  const headers = {
    'id-token': idToken!,
    'x-api-key': config.VINCERE_API_KEY,
    accept: 'application/json',
  }

  // Fetch with retry on 401/403
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

  const resp = await fetchWithRetry(url)

  let docs: any[] = []
  let errorText = ''
  if (resp.ok) {
    const json = await resp.json().catch(() => ({}))
    docs = json?.response?.docs || json?.data || []
  } else {
    errorText = await resp.text().catch(() => '')
  }

  console.log('[candidate.search no-semicolon]', { url, status: resp.status, count: docs.length, error: errorText ? errorText.slice(0, 200) : undefined })

  // Map + dedupe for UI
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
        linkedin: d.linkedin ?? null,
      }
    })
    .filter(Boolean)

  return NextResponse.json({
    results,
    total: results.length,
    ...(debug ? { debug: { url, q, limit, status: resp.status, rawCount: docs.length, error: errorText || undefined } } : {}),
  })
}

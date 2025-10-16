// app/api/html-build/jobs/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

type BuildReq =
  | { kind: 'byIds'; jobIds: string[] }
  | {
      kind: 'search'
      matrix_vars: string
      q?: string
      fq?: string
      start?: number
      limit?: number
    }

type VincereJob = {
  id?: string
  job_title?: string
  location?: any
  formatted_salary_to?: string
  description?: string
  public_description?: string
  internal_description?: string
  owners?: Array<{ id?: string; name?: string }>
  [k: string]: any
}

type OwnerContact = { name?: string; email?: string; phone?: string }

function withApiV2(base: string) {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

function pickLocationText(loc: any) {
  if (!loc) return ''
  const name =
    loc?.name ||
    [loc?.city, loc?.state, loc?.country_code].filter(Boolean).join(', ') ||
    ''
  return String(name || '').trim()
}

function pickDescription(j: VincereJob) {
  return (
    (j.description || '').trim() ||
    (j.public_description || '').trim() ||
    (j.internal_description || '').trim() ||
    ''
  )
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/* ---------------- Local user retrieval ---------------- */
async function fetchLocalUsers(): Promise<any[]> {
  try {
    const mod = (await import('@/lib/users')) as unknown as {
      users?: any[]
      listUsers?: () => Promise<any[]>
      default?: {
        users?: any[]
        listUsers?: () => Promise<any[]>
      }
    }
    const fromNamed =
      (Array.isArray(mod?.users) && mod.users) ||
      (typeof mod?.listUsers === 'function' && (await mod.listUsers()))
    const fromDefault =
      (Array.isArray(mod?.default?.users) && mod.default.users) ||
      (typeof mod?.default?.listUsers === 'function' &&
        (await mod.default.listUsers()))
    const arr = fromNamed || fromDefault || []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/* ---------------- Owner name-matching logic ---------------- */
function nameTokens(s?: string) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function scoreNameMatch(aName: string, bName: string) {
  const a = new Set(nameTokens(aName))
  const b = new Set(nameTokens(bName))
  if (!a.size || !b.size) return 0
  let hits = 0
  b.forEach(t => a.has(t) && hits++)
  const recall = hits / b.size
  const precision = hits / a.size
  const f1 =
    precision && recall ? (2 * precision * recall) / (precision + recall) : 0
  return Math.round(100 * f1)
}

/** Map owners (name only) → local users (email/phone) */
function mapOwnersToContacts(
  owners: VincereJob['owners'],
  localUsers: any[]
): OwnerContact[] {
  if (!Array.isArray(owners) || owners.length === 0) return []

  const local = (localUsers || []).map(u => ({
    name:
      u?.name ||
      [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
      u?.email ||
      '',
    email: u?.email || u?.mail || '',
    phone: u?.phone || u?.phoneNumber || u?.mobile || '',
  }))

  return owners.map(o => {
    const target = o?.name || ''
    if (!target) return { name: '', email: '', phone: '' }

    let best = null as null | { user: any; score: number }
    for (const lu of local) {
      const score = scoreNameMatch(lu.name, target)
      if (!best || score > best.score) best = { user: lu, score }
    }
    if (best && best.score >= 60)
      return {
        name: target,
        email: best.user.email,
        phone: best.user.phone,
      }
    return { name: target, email: '', phone: '' }
  })
}

/* ---------------- HTML builder ---------------- */
function buildJobsHtml(rows: Array<{
  id: string
  title: string
  location: string
  salaryTo: string
  description: string
  owners: OwnerContact[]
}>): string {
  const items = rows
    .map(r => {
      const owners =
        r.owners && r.owners.length
          ? `<div style="font-size:12px;color:#666;margin-top:6px;">
               Owner: ${escapeHtml(r.owners[0]?.name || '')}
               ${
                 r.owners[0]?.email
                   ? ' · ' + escapeHtml(r.owners[0]!.email)
                   : ''
               }
               ${
                 r.owners[0]?.phone
                   ? ' · ' + escapeHtml(r.owners[0]!.phone)
                   : ''
               }
             </div>`
          : ''
      return `
<li style="list-style:none;border:1px solid #eee;border-radius:12px;padding:14px;margin:10px 0;">
  <div style="font-size:16px;font-weight:700;color:#3B3E44;">
    ${escapeHtml(r.title || 'Untitled Role')}
  </div>
  <div style="font-size:13px;color:#3B3E44;margin-top:2px;">
    ${escapeHtml(r.location)}
    ${r.salaryTo ? ` · Up to ${escapeHtml(r.salaryTo)}` : ''}
  </div>
  ${owners}
  <div style="font-size:13px;color:#333;margin-top:8px;line-height:1.4;">
    ${escapeHtml(r.description).slice(0, 550)}${
        r.description.length > 550 ? '…' : ''
      }
  </div>
</li>`
    })
    .join('\n')

  return `
<div style="font-family:Inter,Helvetica,Arial,sans-serif;">
  <h2 style="color:#F7941D;margin:0 0 12px 0;">Featured Jobs</h2>
  <ul style="padding:0;margin:0;">
    ${items}
  </ul>
</div>`
}

/* ---------------- Main handler ---------------- */
export async function POST(req: NextRequest) {
  try {
    requiredEnv()
    let session = await getSession()
    let idToken = session.tokens?.idToken
    const userKey = session.user?.email || session.sessionId || ''
    const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)

    const payload = (await req.json().catch(() => ({}))) as BuildReq

    const doFetch = (url: string) =>
      fetch(url, {
        method: 'GET',
        headers: {
          ...(idToken ? { 'id-token': idToken } : {}),
          'x-api-key': config.VINCERE_API_KEY,
          accept: 'application/json',
        },
        cache: 'no-store',
      })

    const fetchPositionById = async (id: string): Promise<VincereJob | null> => {
      const url = `${BASE}/position/${encodeURIComponent(id)}`
      let res = await doFetch(url)
      if (res.status === 401 || res.status === 403) {
        const ok = await refreshIdToken(userKey)
        if (!ok) return null
        session = await getSession()
        idToken = session.tokens?.idToken
        res = await doFetch(url)
      }
      if (!res.ok) return null
      return (await res.json().catch(() => null)) as VincereJob | null
    }

    let jobs: VincereJob[] = []

    if ((payload as any).kind === 'byIds') {
      const ids = (payload as any).jobIds as string[]
      if (!Array.isArray(ids) || ids.length === 0)
        return NextResponse.json({ ok: true, html: buildJobsHtml([]), jobs: [] })
      const out: VincereJob[] = []
      for (const id of ids.map(s => String(s || '').trim()).filter(Boolean)) {
        const one = await fetchPositionById(id)
        if (one) out.push(one)
      }
      jobs = out
    } else if ((payload as any).kind === 'search') {
      const { matrix_vars, q, fq, start, limit } = payload as Extract<
        BuildReq,
        { kind: 'search' }
      >
      if (!matrix_vars || !matrix_vars.includes('fl='))
        return NextResponse.json(
          { ok: false, error: 'matrix_vars must include fl=...' },
          { status: 400 }
        )

      const path = `${BASE}/position/search/${matrix_vars}`
      const sp = new URLSearchParams()
      if (q) sp.set('q', q)
      if (fq) sp.set('fq', fq)
      if (typeof start === 'number') sp.set('start', String(start))
      if (typeof limit === 'number') sp.set('limit', String(limit))
      const url = path + (sp.toString() ? `?${sp.toString()}` : '')

      let res = await doFetch(url)
      if (res.status === 401 || res.status === 403) {
        const ok = await refreshIdToken(userKey)
        if (!ok)
          return NextResponse.json(
            { ok: false, error: 'Auth refresh failed' },
            { status: 401 }
          )
        session = await getSession()
        idToken = session.tokens?.idToken
        res = await doFetch(url)
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return NextResponse.json(
          { ok: false, error: 'Job search failed', detail },
          { status: 400 }
        )
      }

      const data = await res.json().catch(() => ({}))
      const arr =
        (Array.isArray((data as any)?.data) && (data as any).data) ||
        (Array.isArray((data as any)?.items) && (data as any).items) ||
        (Array.isArray(data) && data) ||
        []
      jobs = arr as VincereJob[]
    } else {
      const legacyIds = (payload as any)?.jobIds
      if (Array.isArray(legacyIds)) {
        const out: VincereJob[] = []
        for (const id of legacyIds.map(s => String(s || '').trim()).filter(Boolean)) {
          const one = await fetchPositionById(id)
          if (one) out.push(one)
        }
        jobs = out
      } else {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Invalid body. Use { kind:"byIds", jobIds:[...] } or { kind:"search", ... }',
          },
          { status: 400 }
        )
      }
    }

    const localUsers = await fetchLocalUsers()
    const rows = jobs.map(j => {
      const owners = mapOwnersToContacts(j?.owners, localUsers)
      return {
        id: String(j?.id || ''),
        title: String(j?.job_title || '').trim(),
        location: pickLocationText(j?.location),
        salaryTo: String(j?.formatted_salary_to || '').trim(),
        description: pickDescription(j),
        owners,
        raw: j,
      }
    })

    const html = buildJobsHtml(rows)
    return NextResponse.json({ ok: true, html, jobs: rows })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Failed' },
      { status: 500 }
    )
  }
}

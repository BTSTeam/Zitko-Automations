// app/api/activecampaign/import-pool/start/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type Norm = { first_name: string; last_name: string; email: string }
type JobStatus = 'running' | 'done' | 'error'
type Job = {
  id: string
  status: JobStatus
  poolId: string
  userId: string
  tagName: string
  startedAt: number
  updatedAt: number
  totals: {
    poolTotal: number | null
    seen: number
    valid: number
    sent: number
    skippedNoEmail: number
    duplicates: number
    pagesFetched: number
  }
  error?: string
}

const JOBS_KEY = '__AC_IMPORT_JOBS__'
const jobs: Map<string, Job> = (globalThis as any)[JOBS_KEY] || new Map()
;(globalThis as any)[JOBS_KEY] = jobs

function withApiV2(base: string): string {
  let b = (base || '').trim().replace(/\/+$/, '')
  if (!/\/api\/v\d+$/i.test(b)) b = `${b}/api/v2`
  return b
}

function extractEmail(c: any): string {
  return (
    c?.email ??
    c?.primary_email ??
    c?.candidate_email ??
    c?.contact_email ??
    c?.emailAddress ??
    c?.contact?.email ??
    c?.person?.email ??
    (Array.isArray(c?.emails) && c.emails[0]?.email) ??
    ''
  )
}
function normalizeCandidates(data: any): Norm[] {
  const arr =
    (Array.isArray(data?.candidates) && data.candidates) ||
    (Array.isArray(data?.docs) && data.docs) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.results) && data.results) ||
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.content) && data.content) ||
    (Array.isArray(data) ? data : [])

  return (arr || [])
    .filter((x: any) => x && typeof x === 'object')
    .map((r: any) => {
      let first = r.first_name ?? r.firstName ?? ''
      let last = r.last_name ?? r.lastName ?? ''
      if ((!first || !last) && typeof r.name === 'string') {
        const parts = r.name.trim().split(/\s+/)
        first = first || parts[0] || ''
        last = last || parts.slice(1).join(' ') || ''
      }
      const email = (extractEmail(r) || '').trim()
      return { first_name: first, last_name: last, email }
    })
}
function parseTotal(d: any): number | null {
  const candidates = [
    d?.numFound,
    d?.total,
    d?.count,
    d?.totalCount,
    d?.meta?.total,
    d?.hits?.total?.value,
  ].find((n) => typeof n === 'number' && n >= 0)
  return typeof candidates === 'number' ? candidates : null
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  const { poolId, userId, tagName, rows = 500, max = 50000, chunk = 500, pauseMs = 300 } =
    await req.json().catch(() => ({}))

  if (!poolId || !userId || !tagName) {
    return NextResponse.json({ error: 'poolId, userId, tagName are required' }, { status: 400 })
  }

  // create job
  const job: Job = {
    id: Math.random().toString(36).slice(2),
    status: 'running',
    poolId,
    userId,
    tagName,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    totals: {
      poolTotal: null,
      seen: 0,
      valid: 0,
      sent: 0,
      skippedNoEmail: 0,
      duplicates: 0,
      pagesFetched: 0,
    },
  }
  jobs.set(job.id, job)

  // fire-and-forget runner
  ;(async () => {
    try {
      let session = await getSession()
      let idToken = session.tokens?.idToken
      const userKey = session.user?.email ?? 'unknown'
      if (!idToken) throw new Error('Not connected to Vincere')

      const BASE = withApiV2(config.VINCERE_TENANT_API_BASE)
      const headers = new Headers({
        'id-token': idToken,
        'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
        accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
      })
      const doFetch = (url: string) => fetch(url, { method: 'GET', headers, cache: 'no-store' })

      const fl = encodeURIComponent('first_name,last_name,email,name,emails')
      const idEnc = encodeURIComponent(poolId)
      const keys = ['talent_pool_id', 'talentpool_id', 'talentPoolId', 'pool_id'] as const

      const emailSeen = new Set<string>()
      let gathered: Norm[] = []

      const importBatch = async (batch: Norm[]) => {
        if (!batch.length) return
        const res = await fetch(`${req.nextUrl.origin}/api/activecampaign/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidates: batch, tagName, excludeAutomations: true }),
        })
        if (!res.ok) {
          const t = await res.text().catch(() => '')
          throw new Error(`AC import failed (${res.status}) ${t}`)
        }
        job.totals.sent += batch.length
        job.updatedAt = Date.now()
      }

      outer: for (const key of keys) {
        let start = 0
        while (job.totals.valid < max) {
          const url = `${BASE}/candidate/search?${key}=${idEnc}&fl=${fl}&rows=${rows}&start=${start}`
          let res = await doFetch(url)
          if (res.status === 401 || res.status === 403) {
            const ok = await refreshIdToken(userKey)
            if (!ok) throw new Error('Auth refresh failed')
            session = await getSession()
            idToken = session.tokens?.idToken
            headers.set('id-token', idToken || '')
            headers.set('Authorization', `Bearer ${idToken}`)
            res = await doFetch(url)
          }

          const data = await res.json().catch(() => ({}))
          if (job.totals.poolTotal == null) {
            const total = parseTotal(data)
            if (typeof total === 'number') job.totals.poolTotal = total
          }

          const page = normalizeCandidates(data)
          job.totals.pagesFetched++
          job.updatedAt = Date.now()

          if (!page.length) break

          for (const r of page) {
            job.totals.seen++
            if (!r.email || !/\S+@\S+\.\S+/.test(r.email)) {
              job.totals.skippedNoEmail++
              continue
            }
            const eKey = r.email.toLowerCase()
            if (emailSeen.has(eKey)) {
              job.totals.duplicates++
              continue
            }
            emailSeen.add(eKey)
            job.totals.valid++
            gathered.push(r)

            if (gathered.length >= chunk) {
              await importBatch(gathered)
              gathered = []
              if (pauseMs) await sleep(pauseMs)
            }
            if (job.totals.valid >= max) break
          }

          if (page.length < rows) break // last page
          start += rows
        }
        if (job.totals.valid >= max) break outer
      }

      if (gathered.length) await importBatch(gathered)

      job.status = 'done'
      job.updatedAt = Date.now()
      jobs.set(job.id, job)
    } catch (e: any) {
      job.status = 'error'
      job.error = e?.message ?? 'Unknown error'
      job.updatedAt = Date.now()
      jobs.set(job.id, job)
    }
  })()

  return NextResponse.json({ jobId: job.id })
}

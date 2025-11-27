// app/api/activecampaign/import-distribution/start/route.ts

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
  poolId: string // here this is actually the distribution list ID
  userId: string
  tagName?: string
  listId?: number | null
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

function normalizeContactsFromSlice(data: any): Norm[] {
  const arr = Array.isArray(data?.content) ? data.content : []
  return arr
    .filter((x: any) => x && typeof x === 'object')
    .map((r: any) => {
      let first = r.first_name ?? r.firstName ?? r.firstname ?? ''
      let last = r.last_name ?? r.lastName ?? r.lastname ?? ''
      if ((!first || !last) && typeof r.name === 'string') {
        const parts = r.name.trim().split(/\s+/)
        first = first || parts[0] || ''
        last = last || parts.slice(1).join(' ') || ''
      }
      const email = (extractEmail(r) || '').trim()
      return { first_name: first, last_name: last, email }
    })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  const {
    distributionListId,
    userId,
    tagName = '',
    listId,
    rows = 200, // kept for backward compatibility, not used
    max = 100000,
    chunk = 250,
    pauseMs = 250,
  } = await req.json().catch(() => ({}))

  const hasTag = String(tagName || '').trim().length > 0
  const listIdNum =
    listId === 0 || listId === '0'
      ? 0
      : listId != null && !Number.isNaN(Number(listId))
      ? Number(listId)
      : null

  const poolId = String(distributionListId || '').trim()

  if (!poolId || !userId || (!hasTag && listIdNum == null)) {
    return NextResponse.json(
      {
        error:
          'distributionListId, userId and at least one of tagName or listId are required',
      },
      { status: 400 },
    )
  }

  // create job
  const job: Job = {
    id: Math.random().toString(36).slice(2),
    status: 'running',
    poolId, // distribution list id
    userId,
    tagName: hasTag ? String(tagName).trim() : undefined,
    listId: listIdNum ?? null,
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
        'content-type': 'application/json',
        'id-token': idToken,
        'x-api-key': (config as any).VINCERE_PUBLIC_API_KEY || config.VINCERE_API_KEY,
        accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
      })

      const doGet = (url: string) =>
        fetch(url, { method: 'GET', headers, cache: 'no-store' })
      const doPost = (url: string, body: any) =>
        fetch(url, {
          method: 'POST',
          headers,
          cache: 'no-store',
          body: JSON.stringify(body),
        })

      const withRefresh = async (fn: () => Promise<Response>): Promise<Response> => {
        let res = await fn()
        if (res.status === 401 || res.status === 403) {
          const ok = await refreshIdToken(userKey)
          if (!ok) return res
          session = await getSession()
          idToken = session.tokens?.idToken
          headers.set('id-token', idToken || '')
          headers.set('Authorization', `Bearer ${idToken}`)
          res = await fn()
        }
        return res
      }

      // We don't have a specialised "getContacts" total endpoint like getCandidates;
      // we derive total from the first slice if provided.
      const emailSeen = new Set<string>()
      let gathered: Norm[] = []
      let sliceIndex = 0
      let last = false

      const importBatch = async (batch: Norm[]) => {
        if (!batch.length) return
        const res = await fetch(`${req.nextUrl.origin}/api/activecampaign/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidates: batch,
            tagName: hasTag ? job.tagName : undefined,
            listIds: job.listId != null ? [job.listId] : [],
            excludeAutomations: true,
          }),
        })
        if (!res.ok) {
          const t = await res.text().catch(() => '')
          throw new Error(`ActiveCampaign import failed (${res.status}) ${t}`)
        }
        job.totals.sent += batch.length
        job.updatedAt = Date.now()
      }

      // 🔁 keep the loop – we just change the URL inside it
      while (!last && job.totals.valid < max && sliceIndex < 400) {
        const url = `${BASE}/distributionlists/${encodeURIComponent(
          poolId,
        )}/user/${encodeURIComponent(
          userId,
        )}/contacts/slice?slice_index=${sliceIndex}`

        const res = await withRefresh(() => doGet(url))

        if (!res.ok) {
          const t = await res.text().catch(() => '')
          if (sliceIndex === 0) {
            throw new Error(
              `Vincere distribution list slice fetch failed (${res.status}) ${t}`,
            )
          } else {
            break
          }
        }

        const sliceJson: any = await res.json().catch(() => ({}))

        // derive poolTotal if available on first slice
        if (sliceIndex === 0) {
          const headerTotalStr = res.headers.get('x-vincere-total')
          const headerTotal =
            headerTotalStr && headerTotalStr.trim() !== ''
              ? Number(headerTotalStr)
              : NaN
          const total =
            typeof sliceJson?.totalElements === 'number'
              ? sliceJson.totalElements
              : !Number.isNaN(headerTotal)
              ? headerTotal
              : null
          job.totals.poolTotal = total
          job.updatedAt = Date.now()
        }

        const page = normalizeContactsFromSlice(sliceJson)
        job.totals.pagesFetched++
        job.updatedAt = Date.now()

        last = !!sliceJson?.last

        if (!page.length) {
          sliceIndex++
          continue
        }

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

        sliceIndex++
      }

      if (gathered.length) {
        await importBatch(gathered)
      }
      
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

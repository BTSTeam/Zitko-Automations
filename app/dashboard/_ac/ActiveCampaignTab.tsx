'use client'

import { useEffect, useRef, useState } from 'react'

type Pool = { id: string | number; name: string }
type Candidate = { first_name: string; last_name: string; email: string }
type Tag = { id: number; tag: string }

const TP_USER_ID = process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID || '29018'

// ==== Preview / pagination tuning (sample fetch only; UI no longer lists rows) ====
const SAMPLE_PREVIEW_LIMIT = 50

type JobStatus = 'running' | 'done' | 'error' | 'not-found'
type JobProgress = {
  id?: string
  status: JobStatus
  poolId?: string
  tagName?: string
  totals?: {
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

export default function ActiveCampaignTab() {
  // Talent pools
  const [pools, setPools] = useState<Pool[]>([])
  const [poolId, setPoolId] = useState<string>('')

  // Preview fetch (not displayed now; kept to drive true totals and validations)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // True pool size (mirrors Vincere count route when available)
  const [poolTotal, setPoolTotal] = useState<number | null>(null)

  // Tags
  const [tags, setTags] = useState<Tag[]>([])
  const [tagName, setTagName] = useState('')

  // Send button state
  type SendState = 'idle' | 'starting' | 'sending' | 'success' | 'error'
  const [sendState, setSendState] = useState<SendState>('idle')

  // Progress (SSE)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Reset when inputs change
  useEffect(() => {
    setSendState('idle')
    setProgress(null)
    setPoolTotal(null)
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
  }, [tagName, poolId])

  // On tab mount: fetch Talent Pools and AC tags
  useEffect(() => {
    fetch('/api/vincere/talentpools/user', { cache: 'no-store' })
      .then(async (r) => {
        const used = r.headers.get('x-vincere-userid') || ''
        if (!r.ok) {
          const errText = await r.text()
          throw new Error(`Pools fetch ${r.status}. userId=${used}. ${errText}`)
        }
        const data = await r.json()
        const arr: any[] = Array.isArray(data?.pools)
          ? data.pools
          : Array.isArray(data?.docs)
          ? data.docs
          : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
          ? data
          : []

        const mapped: Pool[] = arr
          .map((p: any) => ({
            id: p.id ?? p.pool_id ?? p.talent_pool_id ?? String(p?.uid ?? ''),
            name: p.name ?? p.title ?? p.pool_name ?? '(unnamed pool)',
          }))
          .filter((p) => p.id)

        setPools(mapped)
        if (mapped.length && !poolId) setPoolId(String(mapped[0].id))
        if (!mapped.length) setMessage('No Talent Pools returned for user.')
      })
      .catch((e) => {
        setPools([])
        setMessage(e?.message ?? 'Failed to load Talent Pools')
      })

    fetch('/api/activecampaign/tags', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const raw = Array.isArray(data?.tags) ? data.tags : []
        // Hide "Customer"
        const filtered = raw.filter(
          (t: any) => String(t?.tag || '').trim().toLowerCase() !== 'customer'
        )
        setTags(filtered)
      })
      .catch(() => setTags([]))
  }, [])

  async function retrievePoolCandidates() {
    setMessage('')
    if (!poolId) {
      setMessage('Select a Talent Pool')
      return
    }
    setLoading(true)
    try {
      // Request a small preview sample and (where supported) have the server return total
      const qs = new URLSearchParams({
        limit: String(SAMPLE_PREVIEW_LIMIT),
        rows: String(SAMPLE_PREVIEW_LIMIT), // legacy param for older handlers
      }).toString()

      const res = await fetch(
        `/api/vincere/talentpool/${encodeURIComponent(poolId)}/user/${encodeURIComponent(
          TP_USER_ID
        )}/candidates?${qs}`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`Failed to fetch pool candidates (${res.status}): ${t}`)
      }

      const data = await res.json()
      const rows: Candidate[] = Array.isArray(data?.candidates) ? data.candidates : []
      setCandidates(rows)

      // Try meta/header first…
      const headerTotalStr = res.headers.get('x-vincere-total')
      const headerTotal =
        headerTotalStr && headerTotalStr.trim() !== '' ? Number(headerTotalStr) : NaN
      let total: number | null =
        typeof data?.meta?.total === 'number'
          ? data.meta.total
          : !Number.isNaN(headerTotal)
          ? headerTotal
          : null

      setPoolTotal(total)

      // …then ALWAYS call the count endpoint to guarantee a total
      try {
        const cRes = await fetch(
          `/api/vincere/talentpool/${encodeURIComponent(poolId)}/count`,
          { cache: 'no-store' }
        )
        if (cRes.ok) {
          const cData = await cRes.json().catch(() => ({}))
          const h2 = cRes.headers.get('x-vincere-total')
          const n2 = h2 && h2.trim() !== '' ? Number(h2) : NaN
          const t2 =
            typeof cData?.total === 'number'
              ? cData.total
              : !Number.isNaN(n2)
              ? n2
              : null
          if (t2 != null) setPoolTotal(t2)
        }
      } catch {
        // ignore; leave poolTotal as-is
      }

      if (!rows.length) setMessage('No candidates found in this pool.')
    } catch (e: any) {
      setMessage(e?.message ?? 'Failed to load candidates')
      setCandidates([])
      setPoolTotal(null)
    } finally {
      setLoading(false)
    }
  }

  // Enable send when there's a tag and selected pool (preview not required)
  const acEnabled = tagName.trim().length > 0 && poolId !== ''

  async function sendToActiveCampaign() {
    setMessage('')
    setSendState('starting')

    const effectiveTag = tagName.trim()
    if (!effectiveTag) {
      setSendState('error')
      setMessage('Select a Tag')
      return
    }

    try {
      // Start background job (server paginates the whole pool)
      const res = await fetch('/api/activecampaign/import-pool/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId,
          userId: TP_USER_ID,
          tagName: effectiveTag,
          // server-side knobs (safe defaults)
          rows: 200,
          max: 100000,
          chunk: 250,
          pauseMs: 250,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.jobId) {
        setSendState('error')
        setMessage(data?.error || `Failed to start import (${res.status}).`)
        return
      }

      setSendState('sending')

      // open SSE for live progress
      if (esRef.current) esRef.current.close()
      const es = new EventSource(`/api/activecampaign/import-pool/progress/${data.jobId}`)
      esRef.current = es

      es.onmessage = (evt) => {
        const payload: JobProgress = JSON.parse(evt.data || '{}')
        setProgress(payload)
        if (payload.status === 'done') {
          setSendState('success') // shows ✓ in the button
          es.close()
          esRef.current = null
        } else if (payload.status === 'error' || payload.status === 'not-found') {
          setSendState('error')
          setMessage(payload.error || 'Import failed')
          es.close()
          esRef.current = null
        }
      }

      es.onerror = () => {
        // transient network hiccups are fine; server will emit final state
      }
    } catch (e: any) {
      setSendState('error')
      setMessage(e?.message ?? 'Import failed')
    }
  }

  const isSending = sendState === 'sending' || sendState === 'starting'

  // consistent select look + chevron
  const selectBase =
    'w-full rounded-xl border px-3 py-2 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[#001961]'
  const SelectChevron = () => (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.116l3.71-2.885a.75.75 0 1 1 .92 1.18l-4.2 3.265a.75.75 0 0 1-.92 0L5.25 8.39a.75.75 0 0 1-.02-1.18z" />
    </svg>
  )

  // ---------- Progress maths ----------
  // Prefer progress-supplied totals while sending
  const totalInPool = (progress?.totals?.poolTotal ?? poolTotal) ?? null
  const sent = progress?.totals?.sent ?? 0

  // "Actual target" = how many will truly be sent (unique + email)
  // Use max(valid, sent) so % never gets stuck <100 when valid grows late in the job.
  const valid = progress?.totals?.valid ?? 0
  const toSendTarget = progress ? Math.max(valid, sent) : null

  // Denominator preference: if we know actual-to-send, use it; else fall back to pool total
  const denom = (toSendTarget && toSendTarget > 0) ? toSendTarget : (totalInPool || 0)
  const circlePercent = denom > 0 ? Math.min(100, Math.round((sent / denom) * 100)) : 0

  const fmt = (n: number | null | undefined) =>
    typeof n === 'number' ? new Intl.NumberFormat().format(n) : '—'

  // ---------- Circle component ----------
  function CircleProgress({
    percent,
    numerator,
    denominator,
  }: {
    percent: number
    numerator: number
    denominator: number | null
  }) {
    const angle = Math.max(0, Math.min(100, percent)) * 3.6
    return (
      <div className="relative mx-auto my-6 h-[260px] w-[260px] sm:h-[300px] sm:w-[300px]">
        {/* ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(#001961 ${angle}deg, #E5E7EB 0deg)`,
          }}
        />
        {/* inner white disc */}
        <div className="absolute inset-3 sm:inset-4 rounded-full bg-white shadow-inner flex flex-col items-center justify-center text-center">
          <div className="text-sm text-gray-500">{fmt(numerator)} of {fmt(denominator)}</div>
          <div className="mt-1 text-4xl sm:text-5xl font-semibold text-[#001961]">{percent}%</div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {/* TOP PANEL: Controls (white card) */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Talent Pool */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">Talent Pool</span>
            <div className="relative">
              <select
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                className={selectBase}
              >
                {pools.length === 0 ? (
                  <option value="" disabled>
                    No Talent Pools
                  </option>
                ) : (
                  pools.map((p) => (
                    <option key={`${p.id}`} value={`${p.id}`}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
              <SelectChevron />
            </div>
          </label>

          {/* AC Tag */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">Active Campaign Tag</span>
            <div className="relative">
              <select
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                className={selectBase}
              >
                <option value="" disabled>
                  Select a tag
                </option>
                {tags.map((t) => (
                  <option key={t.id} value={t.tag}>
                    {t.tag}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={retrievePoolCandidates}
            disabled={loading || !poolId || isSending}
            className={`rounded-full px-6 py-3 font-medium shadow-sm transition
              ${!loading && poolId && !isSending
                ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
          >
            {loading ? 'Retrieving…' : `Retrieve TP Candidates`}
          </button>

          <button
            onClick={sendToActiveCampaign}
            disabled={!tagName.trim() || !poolId || isSending}
            className={`ml-auto rounded-full px-5 py-3 font-medium shadow-sm transition 
              ${tagName.trim() && poolId && !isSending
                ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
            aria-live="polite"
          >
            {sendState === 'success' ? '✓' : isSending ? 'Sending…' : 'Send to Active Campaign'}
          </button>
        </div>

        {/* Only show non-success messages (errors, info) */}
        {message && <div className="mt-2 text-sm text-gray-700">{message}</div>}
      </div>

      {/* PROGRESS PANEL (replaces the table preview) */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-[#001961]">
              Sending to Active Campaign
            </div>
            <div className="text-xs text-gray-500">
              Tagging candidates as{' '}
              <span className="font-medium text-gray-700">
                {tagName ? `‘${tagName}’` : '—'}
              </span>
            </div>
          </div>

          {/* Small right-side stats */}
          <div className="text-xs text-gray-500">
            {poolTotal != null && (
              <span>{new Intl.NumberFormat().format(poolTotal)} in Talent Pool</span>
            )}
          </div>
        </div>

        {/* Big circle */}
        <div className="mt-2">
          <CircleProgress
            percent={circlePercent}
            numerator={sent}
            denominator={denom || null}
          />
        </div>

        {/* Error display if any */}
        {progress?.status === 'error' && (
          <div className="mt-2 text-sm text-red-600">
            {progress?.error || 'Import failed'}
          </div>
        )}

        {/* Footer line with fetched pages and skips (optional, shows only while running) */}
        {progress && progress.status !== 'not-found' && (
          <div className="mt-2 text-[11px] text-gray-500">
            {typeof progress.totals?.skippedNoEmail === 'number' &&
              progress.totals.skippedNoEmail > 0 && (
                <span>
                  Skipped (no email):{' '}
                  {new Intl.NumberFormat().format(progress.totals.skippedNoEmail)} •{' '}
                </span>
              )}
            {typeof progress.totals?.duplicates === 'number' &&
              progress.totals.duplicates > 0 && (
                <span>
                  Duplicates: {new Intl.NumberFormat().format(progress.totals.duplicates)} •{' '}
                </span>
              )}
            {typeof progress.totals?.pagesFetched === 'number' && (
              <span>Pages fetched: {new Intl.NumberFormat().format(progress.totals.pagesFetched)}</span>
            )}
          </div>
        )}

        {/* Idle helper text */}
        {!progress && (
          <div className="mt-2 text-[11px] text-gray-500">
            Choose a Talent Pool & Tag, then press <span className="font-medium">Send to Active Campaign</span>.
          </div>
        )}
      </div>
    </div>
  )
}

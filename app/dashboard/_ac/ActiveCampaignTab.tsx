'use client'

import { useEffect, useRef, useState } from 'react'

type Pool = { id: string | number; name: string }
type Candidate = { first_name: string; last_name: string; email: string }
type Tag = { id: number; tag: string }

const TP_USER_ID = process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID || '29018'

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

  // Candidates preview
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // True pool size from API
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
      const res = await fetch(
        `/api/vincere/talentpool/${encodeURIComponent(poolId)}/user/${encodeURIComponent(
          TP_USER_ID
        )}/candidates?rows=500`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`Failed to fetch pool candidates (${res.status}): ${t}`)
      }

      const data = await res.json()
      const rows: Candidate[] = Array.isArray(data?.candidates) ? data.candidates : []
      setCandidates(rows)

      // NEW: pool total from meta OR header fallback
      const headerTotalStr = res.headers.get('x-vincere-total')
      const headerTotal =
        headerTotalStr && headerTotalStr.trim() !== '' ? Number(headerTotalStr) : NaN
      const total =
        typeof data?.meta?.total === 'number'
          ? data.meta.total
          : !Number.isNaN(headerTotal)
          ? headerTotal
          : null
      setPoolTotal(total)

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
      // start background job
      const res = await fetch('/api/activecampaign/import-pool/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId,
          userId: TP_USER_ID,
          tagName: effectiveTag,
          rows: 500,
          max: 50000,
          chunk: 500,
          pauseMs: 300,
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
          setSendState('success') // shows ✓
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
        // network hiccup; let server drive final state
      }
    } catch (e: any) {
      setSendState('error')
      setMessage(e?.message ?? 'Import failed')
    }
  }

  const cell = 'px-4 py-2'
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

  // Prefer progress total when sending; otherwise use preview's poolTotal
  const totalInPool = (progress?.totals?.poolTotal ?? poolTotal) ?? null
  const sent = progress?.totals?.sent ?? 0
  const percent =
    totalInPool && totalInPool > 0 ? Math.min(100, Math.round((sent / totalInPool) * 100)) : 0

  const fmt = (n: number | null | undefined) =>
    typeof n === 'number' ? new Intl.NumberFormat().format(n) : '—'

  // scroller only when >25 rows (so all 25 show without scrolling)
  const tableWrapClass =
    candidates.length > 25 ? 'max-h-96 overflow-auto text-sm' : 'text-sm'

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

        {/* Actions + progress */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={retrievePoolCandidates}
            disabled={loading || !poolId || isSending}
            className={`rounded-full px-6 py-3 font-medium shadow-sm transition
              ${!loading && poolId && !isSending
                ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
          >
            {loading ? 'Retrieving…' : 'Retrieve TP Candidates'}
          </button>

          <button
            onClick={sendToActiveCampaign}
            disabled={!acEnabled || isSending}
            className={`ml-auto rounded-full px-5 py-3 font-medium shadow-sm transition 
              ${acEnabled && !isSending
                ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
            aria-live="polite"
          >
            {sendState === 'success' ? '✓' : isSending ? 'Sending…' : 'Send to Active Campaign'}
          </button>
        </div>

        {/* Progress bar + numbers */}
        {progress && progress.status !== 'not-found' && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Tagging & sending to ActiveCampaign</span>
              <span>
                {fmt(sent)} / {fmt(totalInPool)} {totalInPool ? `(${percent}%)` : ''}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-2 bg-[#001961] transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            {progress?.status === 'error' && (
              <div className="mt-2 text-sm text-red-600">
                {progress?.error || 'Import failed'}
              </div>
            )}
          </div>
        )}

        {/* Only show non-success messages (errors, info) */}
        {message && <div className="mt-2 text-sm text-gray-700">{message}</div>}
      </div>

      {/* RESULTS PANEL: white card, conditional scroller + LEFT-aligned counts */}
      <div className="rounded-2xl border bg-white">
        <div className="flex items-center justify-start px-4 py-2">
          <div className="text-xs text-gray-500">
            {new Intl.NumberFormat().format(candidates.length)} loaded
            {poolTotal != null ? ` · ${new Intl.NumberFormat().format(poolTotal)} in pool` : ''}
          </div>
        </div>

        <div className={tableWrapClass}>
          {candidates.length === 0 ? (
            <div className="px-4 py-6 text-gray-500">No candidates loaded.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className={cell}>Candidate Name</th>
                  <th className={cell}>Email</th>
                  <th className={cell}>Tag</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
                  return (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className={cell}>{name || ''}</td>
                      <td className={cell}>
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="underline decoration-dotted">
                            {c.email}
                          </a>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className={cell}>{(tagName || '').trim()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

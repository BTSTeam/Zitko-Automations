'use client'

import { useEffect, useRef, useState } from 'react'

type Pool = { id: string | number; name: string }
type Candidate = { first_name: string; last_name: string; email: string }
type Tag = { id: number; tag: string }

const TP_USER_ID = process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID || '29018'

// ===== Password Gate (UI-only) =====
const TAB_PW =
  ((process.env.ACTIVE_CAMPAIGN_TAB_PASSWORD ?? '').trim() || 'letmein')
const UNLOCK_KEY = 'acTabUnlocked'

// ==== Preview / pagination tuning (UI only) ====
const SAMPLE_PREVIEW_LIMIT = 50 // import job still processes all on the server

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
  // ===== Gate state =====
  const [unlocked, setUnlocked] = useState<boolean>(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState<string>('')

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? sessionStorage.getItem(UNLOCK_KEY) : null
      if (saved === 'true') setUnlocked(true)
    } catch {
      // ignore
    }
  }, [])

  function tryUnlock(e?: React.FormEvent) {
    e?.preventDefault()
    // Empty password env means "disable gate"
    if (!TAB_PW) {
      setUnlocked(true)
      try { sessionStorage.setItem(UNLOCK_KEY, 'true') } catch {}
      return
    }
    if (pw.trim() === TAB_PW) {
      setUnlocked(true)
      setPwError('')
      try { sessionStorage.setItem(UNLOCK_KEY, 'true') } catch {}
    } else {
      setPwError('Incorrect password. Access denied.')
    }
  }

  // ===== Existing tab state =====
  const [pools, setPools] = useState<Pool[]>([])
  const [poolId, setPoolId] = useState<string>('')

  // Candidates preview (used only to trigger count + sanity)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // True pool size
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
    if (!unlocked) return
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
  }, [unlocked]) // only load once unlocked

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
        limit: String(SAMPLE_PREVIEW_LIMIT), // new param
        rows: String(SAMPLE_PREVIEW_LIMIT),  // legacy param (B/C)
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
      // Start background job (server paginates whole pool)
      const res = await fetch('/api/activecampaign/import-pool/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId,
          userId: TP_USER_ID,
          tagName: effectiveTag,
          rows: 200,
          max: 100000,
          chunk: 25,
          pauseMs: 150,
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

  const isSending = sendState === 'sending' || sendState === 'starting'

  // Prefer progress total when sending; otherwise use preview's poolTotal
  const totalInPool = (progress?.totals?.poolTotal ?? poolTotal) ?? null
  const sent = progress?.totals?.sent ?? 0
  const denominator = progress?.totals?.valid ?? totalInPool ?? null // % based on actual valid where available
  const percent =
    denominator && denominator > 0 ? Math.min(100, Math.round((sent / denominator) * 100)) : 0

  const fmt = (n: number | null | undefined) =>
    typeof n === 'number' ? new Intl.NumberFormat().format(n) : '—'

  // ====== Circular progress (thicker ring) ======
  const RING_SIZE = 360 // px
  const RING_THICKNESS = 28 // px (thicker than before)
  const pctDeg = Math.max(0, Math.min(360, Math.round((percent / 100) * 360)))

  // ===== Gate UI (render early if locked) =====
  if (!unlocked) {
    return (
      <div className="relative min-h-[60vh]">
        <div className="absolute inset-0 grid place-items-center bg-white">
          <form
            onSubmit={tryUnlock}
            className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm"
          >
            <div className="text-center mb-4">
              <div className="text-4xl">🔒</div>
              <h2 className="mt-2 text-lg font-semibold">Restricted Area</h2>
              <p className="text-sm text-gray-600">Enter the password to access ActiveCampaign tools.</p>
            </div>

            <label className="grid gap-1">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                className={`rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001961] ${pwError ? 'border-red-500' : ''}`}
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value)
                  if (pwError) setPwError('')
                }}
                placeholder="••••••••"
                autoFocus
              />
            </label>

            {pwError && <div className="mt-2 text-sm text-red-600">{pwError}</div>}

            <button
              type="submit"
              className="mt-4 w-full rounded-full px-5 py-3 font-medium !bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ===== Normal tab UI (unchanged) =====
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
                className="w-full rounded-xl border px-3 py-2 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[#001961]"
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
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.116l3.71-2.885a.75.75 0 1 1 .92 1.18l-4.2 3.265a.75.75 0 0 1-.92 0L5.25 8.39a.75.75 0 0 1-.02-1.18z" />
              </svg>
            </div>
          </label>

          {/* AC Tag */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">Active Campaign Tag</span>
            <div className="relative">
              <select
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[#001961]"
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
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.116l3.71-2.885a.75.75 0 1 1 .92 1.18l-4.2 3.265a.75.75 0 0 1-.92 0L5.25 8.39a.75.75 0 0 1-.02-1.18z" />
              </svg>
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
            {loading ? 'Retrieving…' : 'Retrieve TP Candidates'}
          </button>

          <button
            onClick={sendToActiveCampaign}
            disabled={!(tagName.trim().length > 0 && poolId !== '') || isSending}
            className={`ml-auto rounded-full px-5 py-3 font-medium shadow-sm transition 
              ${tagName.trim().length > 0 && poolId !== '' && !isSending
                ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
            aria-live="polite"
          >
            {sendState === 'success' ? '✓' : isSending ? 'Sending…' : 'Send to Active Campaign'}
          </button>
        </div>

        {/* Only show non-success errors/info */}
        {message && sendState !== 'success' && (
          <div className="mt-2 text-sm text-gray-700">{message}</div>
        )}
      </div>

      {/* PROGRESS PANEL (no table) */}
      <div className="rounded-2xl border bg-white p-6">
        {/* Header — show only Tagging line, in dark blue */}
        <div className="text-[#001961] font-semibold text-lg">
          Tagging candidates as <span className="font-normal text-gray-600">“{tagName || '—'}”</span>
        </div>

        <div className="mt-6 flex items-center justify-center">
          <div
            className="relative"
            style={{ width: RING_SIZE, height: RING_SIZE }}
          >
            {/* Track + progress via conic-gradient + mask for thickness */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(#001961 ${pctDeg}deg, #e5e7eb 0)`,
                WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${RING_THICKNESS}px), black 0)`,
                mask: `radial-gradient(farthest-side, transparent calc(100% - ${RING_THICKNESS}px), black 0)`,
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))',
              }}
            />
            {/* Inner plate */}
            <div
              className="absolute rounded-full bg-white"
              style={{
                inset: RING_THICKNESS,
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
              }}
            />
            {/* Center labels */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-xs text-gray-500">
                {fmt(sent)} of {fmt(denominator)}
              </div>
              <div className="text-5xl font-bold text-[#001961] mt-1">{percent}%</div>
            </div>
          </div>
        </div>

        {/* Error state (if any) */}
        {progress?.status === 'error' && (
          <div className="mt-4 text-sm text-red-600">
            {progress?.error || 'Import failed'}
          </div>
        )}
      </div>
    </div>
  )
}

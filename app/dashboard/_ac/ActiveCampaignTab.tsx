'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Pool = { id: string | number; name: string }
type Candidate = { first_name: string; last_name: string; email: string }
type Tag = { id: string; tag: string }

const TP_USER_ID = process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID || '29018'

type SourceMode = 'talentpool' | 'distribution'

function normalizeEnvPw(s: string | undefined | null) {
  const t = String(s ?? '').trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  )
    return t.slice(1, -1)
  return t
}
const RAW_ENV = process.env.NEXT_PUBLIC_ACTIVE_CAMPAIGN_TAB ?? ''
const TAB_PW = normalizeEnvPw(RAW_ENV)

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
  // Gate
  const [unlocked, setUnlocked] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')

  // Source mode: Talent Pools vs Distribution Lists
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(null)

  function tryUnlock(e?: React.FormEvent) {
    e?.preventDefault()
    if (!TAB_PW)
      return setPwError('Password is not configured on this deployment.')
    if (pw.trim() === TAB_PW) {
      setUnlocked(true)
      setPwError('')
    } else setPwError('Incorrect password. Access denied.')
  }

  // State
  const [pools, setPools] = useState<Pool[]>([])
  const [poolId, setPoolId] = useState<string>('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [poolTotal, setPoolTotal] = useState<number | null>(null)

  // Tags & list
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagQuery, setTagQuery] = useState('')
  const [listName, setListName] = useState('')

  // Chip-field dropdown state
  const [tagOpen, setTagOpen] = useState(false)
  const tagFieldRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Two-click confirmation
  const [confirmSend, setConfirmSend] = useState(false)

  // Send state
  type SendState = 'idle' | 'starting' | 'sending' | 'success' | 'error'
  const [sendState, setSendState] = useState<SendState>('idle')

  // Progress (SSE)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [currentTag, setCurrentTag] = useState<string>('') // show which tag is being applied right now
  const esRef = useRef<EventSource | null>(null)

  // Close dropdown on outside click (but not when clicking inside popover)
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (tagFieldRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setTagOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  // Reset on input change
  useEffect(() => {
    setSendState('idle')
    setProgress(null)
    setPoolTotal(null)
    setConfirmSend(false)
    setCurrentTag('')
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
  }, [selectedTags, listName, poolId])

  // Load data after unlock & mode selection
  useEffect(() => {
    if (!unlocked || !sourceMode) return

    setMessage('')
    setPools([])
    setPoolId('')
    setCandidates([])
    setPoolTotal(null)
    setProgress(null)

    const url =
      sourceMode === 'talentpool'
        ? '/api/vincere/talentpools/user'
        : '/api/vincere/distributionlists/user'

    // Talent Pools or Distribution Lists
    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        const used = r.headers.get('x-vincere-userid') || ''
        if (!r.ok)
          throw new Error(
            `Pools fetch ${r.status}. userId=${used}. ${await r.text()}`,
          )
        const data = await r.json()
        const arr: any[] =
          Array.isArray(data?.pools)
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
            id:
              p.id ??
              p.pool_id ??
              p.talent_pool_id ??
              p.distribution_list_id ??
              String(p?.uid ?? ''),
            name:
              p.name ??
              p.title ??
              p.pool_name ??
              p.list_name ??
              '(unnamed list)',
          }))
          .filter((p) => p.id)

        setPools(mapped)
        if (mapped.length) setPoolId(String(mapped[0].id))
        if (!mapped.length) {
          setMessage(
            sourceMode === 'talentpool'
              ? 'No Talent Pools returned for user.'
              : 'No Distribution Lists returned for user.',
          )
        }
      })
      .catch((e) => {
        setPools([])
        setPoolId('')
        setMessage(
          e?.message ??
            (sourceMode === 'talentpool'
              ? 'Failed to load Talent Pools'
              : 'Failed to load Distribution Lists'),
        )
      })

    // ActiveCampaign Tags
    fetch('/api/activecampaign/tags', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) return setTags([])
        const raw = Array.isArray(data?.tags) ? data.tags : []
        const filtered = raw
          .filter(
            (t: any) =>
              String(t?.tag || '').trim().toLowerCase() !== 'customer',
          )
          .sort((a: any, b: any) => String(a.tag).localeCompare(String(b.tag)))
        setTags(filtered)
      })
      .catch(() => setTags([]))
  }, [unlocked, sourceMode])

  const filteredTags = useMemo(
    () =>
      tags.filter((t) =>
        t.tag.toLowerCase().includes(tagQuery.toLowerCase()),
      ),
    [tags, tagQuery],
  )

  async function retrievePoolCandidates() {
    setMessage('')

    if (!sourceMode) {
      setMessage('Select a source (Talent Pools or Distribution Lists) first.')
      return
    }

    if (!poolId) {
      setMessage(
        sourceMode === 'talentpool'
          ? 'Select a Talent Pool'
          : 'Select a Distribution List',
      )
      return
    }

    setLoading(true)
    try {
      const qs = new URLSearchParams({
        limit: String(SAMPLE_PREVIEW_LIMIT),
        rows: String(SAMPLE_PREVIEW_LIMIT),
      }).toString()

      const endpoint =
        sourceMode === 'talentpool'
          ? `/api/vincere/talentpool/${encodeURIComponent(
              poolId,
            )}/user/${encodeURIComponent(TP_USER_ID)}/candidates?${qs}`
          : `/api/vincere/distributionlists/${encodeURIComponent(
              poolId,
            )}/user/${encodeURIComponent(TP_USER_ID)}/contacts?${qs}`

      const res = await fetch(endpoint, { cache: 'no-store' })
      if (!res.ok)
        throw new Error(
          `Failed to fetch ${
            sourceMode === 'talentpool' ? 'pool candidates' : 'list contacts'
          } (${res.status}): ${await res.text()}`,
        )

      const data = await res.json()

      let rows: Candidate[] = []

      if (sourceMode === 'talentpool') {
        rows = Array.isArray(data?.candidates) ? data.candidates : []
      } else {
        // distribution list contacts – our route already normalises the shape
        rows = Array.isArray(data?.contacts) ? data.contacts : []
      }

      setCandidates(rows)

      const headerTotalStr = res.headers.get('x-vincere-total')
      const headerTotal =
        headerTotalStr && headerTotalStr.trim() !== ''
          ? Number(headerTotalStr)
          : NaN
      let total: number | null =
        typeof data?.meta?.total === 'number'
          ? data.meta.total
          : !Number.isNaN(headerTotal)
          ? headerTotal
          : null
      setPoolTotal(total)

      // For Talent Pools we have an extra /count endpoint
      if (sourceMode === 'talentpool') {
        try {
          const cRes = await fetch(
            `/api/vincere/talentpool/${encodeURIComponent(poolId)}/count`,
            { cache: 'no-store' },
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
          // ignore
        }
      }

      if (!rows.length) {
        setMessage(
          sourceMode === 'talentpool'
            ? 'No candidates found in this pool.'
            : 'No contacts found in this distribution list.',
        )
      }
    } catch (e: any) {
      setMessage(
        e?.message ??
          (sourceMode === 'talentpool'
            ? 'Failed to load candidates'
            : 'Failed to load contacts'),
      )
      setCandidates([])
      setPoolTotal(null)
    } finally {
      setLoading(false)
    }
  }

  const acEnabled =
    (selectedTags.length > 0 || listName.trim().length > 0) && poolId !== ''

  // ---- helper: run ONE import job (single tag) and resolve on finish
  async function runSingleImport(
    tagName: string | undefined,
    listId: number | null,
  ) {
    if (!sourceMode)
      throw new Error('Source mode not selected (internal error).')

    const url =
      sourceMode === 'talentpool'
        ? '/api/activecampaign/import-pool/start'
        : '/api/activecampaign/import-distribution/start'

    const body =
      sourceMode === 'talentpool'
        ? {
            poolId,
            userId: TP_USER_ID,
            tagName: tagName || undefined, // same backend field as before
            listId: listId ?? undefined,
            rows: 200,
            max: 100000,
            chunk: 25,
            pauseMs: 150,
          }
        : {
            distributionListsId: poolId,
            userId: TP_USER_ID,
            tagName: tagName || undefined,
            listId: listId ?? undefined,
            rows: 200,
            max: 100000,
            chunk: 25,
            pauseMs: 150,
          }

    // start job
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok || !data?.jobId) {
      throw new Error(data?.error || `Failed to start import (${res.status}).`)
    }

    // listen to progress via SSE and resolve when done
    if (esRef.current) esRef.current.close()
    // We reuse the same progress endpoint for both types
    const es = new EventSource(
      `/api/activecampaign/import-pool/progress/${data.jobId}`,
    )
    esRef.current = es

    await new Promise<void>((resolve, reject) => {
      es.onmessage = (evt) => {
        const payload: JobProgress = JSON.parse(evt.data || '{}')
        setProgress(payload)
        if (payload?.tagName) setCurrentTag(payload.tagName)
        if (payload.status === 'done') {
          es.close()
          esRef.current = null
          resolve()
        } else if (
          payload.status === 'error' ||
          payload.status === 'not-found'
        ) {
          es.close()
          esRef.current = null
          reject(new Error(payload.error || 'Import failed'))
        }
      }
      es.onerror = () => {
        // network hiccup; keep waiting — server will push the final state
      }
    })
  }

  async function sendToActiveCampaign() {
    setMessage('')
    setSendState('starting')
    setCurrentTag('')

    // normalize inputs
    const tagsToApply = selectedTags.map((t) => t.trim()).filter(Boolean)
    const effectiveList = listName.trim()

    if (tagsToApply.length === 0 && !effectiveList) {
      setSendState('error')
      setMessage('Specify a Tag or List')
      return
    }

    try {
      // create list once (if needed)
      let createdListId: number | null = null
      if (effectiveList) {
        const lr = await fetch('/api/activecampaign/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: effectiveList }),
        })
        const lj = await lr.json()
        if (!lr.ok || !lj?.id) {
          setSendState('error')
          setMessage(lj?.error || `Failed to create list (${lr.status}).`)
          return
        }
        createdListId = Number(lj.id)
      }

      // When multiple tags are selected, apply them **one by one** using the existing single-tag API.
      // This prevents AC from creating a single combined tag.
      setSendState('sending')

      if (tagsToApply.length === 0) {
        // no tag, just list add
        await runSingleImport(undefined, createdListId)
      } else {
        for (const t of tagsToApply) {
          setCurrentTag(t)
          await runSingleImport(t, createdListId)
        }
      }

      setSendState('success')
      setCurrentTag('')
    } catch (e: any) {
      setSendState('error')
      setMessage(e?.message ?? 'Import failed')
    }
  }

  function handleSendClick() {
    if (!confirmSend) {
      setConfirmSend(true)
      return
    }
    setConfirmSend(false)
    sendToActiveCampaign()
  }

  function onTagFieldKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Backspace' && selectedTags.length && !tagQuery) {
      e.preventDefault()
      setSelectedTags((prev) => prev.slice(0, -1))
      setConfirmSend(false)
    }
  }

  const isSending = sendState === 'sending' || sendState === 'starting'
  const totalInPool = (progress?.totals?.poolTotal ?? poolTotal) ?? null
  const sent = progress?.totals?.sent ?? 0
  const denominator = (progress?.totals?.valid ?? totalInPool) ?? null
  const percent =
    denominator && denominator > 0
      ? Math.min(100, Math.round((sent / denominator) * 100))
      : 0
  const fmt = (n: number | null | undefined) =>
    typeof n === 'number' ? new Intl.NumberFormat().format(n) : '—'
  const RING_SIZE = 360
  const RING_THICKNESS = 28
  const pctDeg = Math.max(
    0,
    Math.min(360, Math.round((percent / 100) * 360)),
  )

  // -------------------------------
  //  Render
  // -------------------------------

  if (!unlocked) {
    return (
      <div className="relative min-h-[60vh]">
        <div className="absolute inset-0 grid place-items-center bg-white">
          <form
            onSubmit={tryUnlock}
            className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm"
          >
            <div className="text-center mb-4">
              <div className="text-4xl" />
              <h2 className="mt-2 text-lg font-semibold">Restricted Area</h2>
              <p className="text-sm text-gray-600">
                Enter the password to access Active Campaign tools.
              </p>
            </div>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                className={`rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001961] ${
                  pwError ? 'border-red-500' : ''
                }`}
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value)
                  if (pwError) setPwError('')
                }}
                placeholder="••••••••"
                autoFocus
              />
            </label>
            {pwError && (
              <div className="mt-2 text-sm text-red-600">{pwError}</div>
            )}
            <button
              type="submit"
              className="mt-4 w-full rounded-full px-5 py-3 font-medium !bg-[#001961] !text-white hover:opacity-95"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Popup to choose Talent Pools vs Distribution Lists
  if (unlocked && !sourceMode) {
    const chooseMode = (mode: SourceMode) => {
      setSourceMode(mode)
      setPools([])
      setPoolId('')
      setCandidates([])
      setPoolTotal(null)
      setMessage('')
      setProgress(null)
    }

    return (
      <div className="relative min-h-[60vh]">
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">Choose data source</h2>
            <p className="text-sm text-gray-600 mb-4">
              What would you like to send to ActiveCampaign?
            </p>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => chooseMode('talentpool')}
                className="w-full rounded-xl border px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="font-medium">Talent Pools</div>
                <div className="text-xs text-gray-600">
                  Select candidates from a Vincere Talent Pool.
                </div>
              </button>
              <button
                type="button"
                onClick={() => chooseMode('distribution')}
                className="w-full rounded-xl border px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="font-medium">Distribution Lists</div>
                <div className="text-xs text-gray-600">
                  Select contacts from a Vincere Distribution List.
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main UI
  return (
    <div className="grid gap-6">
      {/* Controls Card */}
      <div className="rounded-2xl border bg-white p-4 overflow-visible">
        {/* Back to source selection */}
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleBackToSourceSelect}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border hover:bg-gray-50"
            aria-label="Back to source selection"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4 text-gray-700"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </button>
  
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-gray-400">
              Source
            </span>
            <span className="text-sm font-medium text-gray-800">
              {sourceMode === 'distribution' ? 'Distribution Lists' : 'Talent Pools'}
            </span>
          </div>
        </div>
  
        {/* Two rows x two cols:
            Row 1 = Talent Pool/List (L) + Tags (R)
            Row 2 = Active Campaign List (L) + Buttons (R) */}
        <div className="grid gap-4 md:grid-cols-2 md:grid-rows-[auto_auto] items-start">
          {/* Row 1, Col 1 — Talent Pool / Distribution List */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">
              {sourceMode === 'distribution'
                ? 'Distribution List'
                : 'Talent Pool'}
            </span>
            <div className="relative">
              <select
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[#001961]"
              >
                {pools.length === 0 ? (
                  <option value="" disabled>
                    {sourceMode === 'distribution'
                      ? 'No Distribution Lists'
                      : 'No Talent Pools'}
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
              >
                <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.116l3.71-2.885a.75.75 0 1 1 .92 1.18l-4.2 3.265a.75.75 0 0 1-.92 0L5.25 8.39a.75.75 0 0 1-.02-1.18z" />
              </svg>
            </div>
          </label>

          {/* Row 1, Col 2 — Tags (chip field + internal dropdown) */}
          <label className="grid gap-1 relative">
            <span className="text-sm font-medium">Active Campaign Tag</span>

            {/* Chip field */}
            <div
              ref={tagFieldRef}
              role="combobox"
              aria-expanded={tagOpen}
              tabIndex={0}
              onClick={() => setTagOpen((o) => !o)}
              onKeyDown={onTagFieldKeyDown}
              className="w-full rounded-xl border px-2 py-1.5 min-h-[42px] flex items-center flex-wrap gap-2
                         focus-within:ring-2 focus-within:ring-[#001961] bg-white cursor-text"
            >
              {selectedTags.length === 0 && (
                <span className="text-sm text-gray-400 px-1">
                  No tags selected
                </span>
              )}

              {selectedTags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove ${t}`}
                    title="Remove"
                    className="text-gray-500 hover:text-gray-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedTags((prev) => prev.filter((x) => x !== t))
                      setConfirmSend(false)
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}

              {/* caret */}
              <svg
                className="ml-auto mr-1 h-4 w-4 text-gray-500 pointer-events-none"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.116l3.71-2.885a.75.75 0 1 1 .92 1.18l-4.2 3.265a.75.75 0 0 1-.92 0L5.25 8.39a.75.75 0 0 1-.02-1.18z" />
              </svg>
            </div>

            {/* Internal dropdown (popover) */}
            {tagOpen && (
              <div
                ref={popoverRef}
                className="absolute left-0 right-0 mt-1 rounded-xl border bg-white shadow-lg z-50"
              >
                <div className="border-b px-3 py-2">
                  <input
                    value={tagQuery}
                    onChange={(e) => {
                      setTagQuery(e.target.value)
                    }}
                    placeholder="Search tags..."
                    className="w-full outline-none text-sm"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-auto">
                  {filteredTags.map((t) => {
                    const checked = selectedTags.includes(t.tag)
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer select-none"
                        onClick={() => {
                          setSelectedTags((prev) =>
                            checked
                              ? prev.filter((x) => x !== t.tag)
                              : [...prev, t.tag],
                          )
                          setConfirmSend(false)
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="h-4 w-4 accent-[#001961]"
                        />
                        <span>{t.tag}</span>
                      </label>
                    )
                  })}
                  {filteredTags.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-500">
                      No tags match your search.
                    </div>
                  )}
                </div>
              </div>
            )}
          </label>

          {/* Row 2, Col 1 — Active Campaign List */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">Active Campaign List</span>
            <input
              type="text"
              placeholder="New list name"
              className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001961]"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
            />
          </label>

          {/* Row 2, Col 2 — Buttons (inline with List) */}
          <div className="flex items-center gap-3 justify-start md:justify-end self-end">
            <button
              onClick={retrievePoolCandidates}
              disabled={loading || !poolId || isSending}
              className={`rounded-full px-6 py-3 font-medium shadow-sm transition
                ${
                  !loading && poolId && !isSending
                    ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                }`}
            >
              {loading
                ? 'Retrieving…'
                : sourceMode === 'distribution'
                ? 'Retrieve Contacts'
                : 'Retrieve TP Candidates'}
            </button>

            <button
              onClick={handleSendClick}
              disabled={!acEnabled || isSending}
              className={`rounded-full px-5 py-3 font-medium shadow-sm transition 
                ${
                  acEnabled && !isSending
                    ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                }`}
              aria-live="polite"
            >
              {sendState === 'success'
                ? '✓'
                : isSending
                ? 'Sending…'
                : confirmSend
                ? 'Are you Sure ?'
                : 'Send to Active Campaign'}
            </button>
          </div>
        </div>

        {message && sendState !== 'success' && (
          <div className="mt-2 text-sm text-gray-700">{message}</div>
        )}

        {(poolTotal != null || candidates.length > 0) && (
          <div className="mt-4 text-xs text-gray-500">
            {sourceMode === 'distribution'
              ? <>Retrieved {fmt(poolTotal ?? candidates.length)} contacts in this list.</>
              : <>Retrieved {fmt(poolTotal ?? candidates.length)} candidates in this pool.</>}
          </div>
        )}
      </div>

      {/* Progress Card */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="text-[#001961] font-semibold text-lg">
          {selectedTags.length && listName.trim() ? (
            <>
              {sourceMode === 'distribution' ? 'Tagging contacts' : 'Tagging candidates'} as{' '}
              <span className="font-normal text-gray-600">
                “{selectedTags.join(', ')}”
              </span>{' '}
              and adding to list{' '}
              <span className="font-normal text-gray-600">
                “{listName.trim()}”
              </span>
            </>
          ) : selectedTags.length ? (
            <>
              {sourceMode === 'distribution' ? 'Tagging contacts' : 'Tagging candidates'} as{' '}
              <span className="font-normal text-gray-600">
                “{selectedTags.join(', ')}”
              </span>
            </>
          ) : listName.trim() ? (
            <>
              Adding{' '}
              {sourceMode === 'distribution' ? 'contacts' : 'candidates'} to list{' '}
              <span className="font-normal text-gray-600">
                “{listName.trim()}”
              </span>
            </>
          ) : (
            <>No tag or list specified</>
          )}
        </div>

        {currentTag && sendState === 'sending' && (
          <div className="mt-1 text-sm text-gray-500">
            Applying tag: “{currentTag}”
          </div>
        )}

        <div className="mt-6 flex items-center justify-center">
          <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(#001961 ${pctDeg}deg, #e5e7eb 0)`,
                WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${RING_THICKNESS}px), black 0)`,
                mask: `radial-gradient(farthest-side, transparent calc(100% - ${RING_THICKNESS}px), black 0)`,
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))',
              }}
            />
            <div
              className="absolute rounded-full bg-white"
              style={{
                inset: RING_THICKNESS,
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
              }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-xs text-gray-500">
                {fmt(sent)} of {fmt(denominator)}
              </div>
              <div className="text-5xl font-bold text-[#001961] mt-1">
                {percent}%
              </div>
            </div>
          </div>
        </div>

        {progress?.status === 'error' && (
          <div className="mt-4 text-sm text-red-600">
            {progress?.error || 'Import failed'}
          </div>
        )}
      </div>
    </div>
  )
}

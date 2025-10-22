'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Pool = { id: string | number; name: string }
type Candidate = { first_name: string; last_name: string; email: string }
type Tag = { id: string; tag: string }

const TP_USER_ID = process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID || '29018'

function normalizeEnvPw(s: string | undefined | null) {
  const t = String(s ?? '').trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
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

  function tryUnlock(e?: React.FormEvent) {
    e?.preventDefault()
    if (!TAB_PW) return setPwError('Password is not configured on this deployment.')
    if (pw.trim() === TAB_PW) { setUnlocked(true); setPwError('') }
    else setPwError('Incorrect password. Access denied.')
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

  // Send state
  const [confirmSend, setConfirmSend] = useState(false)
  type SendState = 'idle' | 'starting' | 'sending' | 'success' | 'error'
  const [sendState, setSendState] = useState<SendState>('idle')

  // Progress (SSE)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Reset on input change
  useEffect(() => {
    setSendState('idle')
    setProgress(null)
    setPoolTotal(null)
    setConfirmSend(false)
    if (esRef.current) { esRef.current.close(); esRef.current = null }
  }, [selectedTags, listName, poolId])

  // Load data after unlock
  useEffect(() => {
    if (!unlocked) return

    // Talent Pools
    fetch('/api/vincere/talentpools/user', { cache: 'no-store' })
      .then(async (r) => {
        const used = r.headers.get('x-vincere-userid') || ''
        if (!r.ok) throw new Error(`Pools fetch ${r.status}. userId=${used}. ${await r.text()}`)
        const data = await r.json()
        const arr: any[] =
          Array.isArray(data?.pools) ? data.pools :
          Array.isArray(data?.docs) ? data.docs :
          Array.isArray(data?.items) ? data.items :
          Array.isArray(data) ? data : []

        const mapped: Pool[] = arr.map((p: any) => ({
          id: p.id ?? p.pool_id ?? p.talent_pool_id ?? String(p?.uid ?? ''),
          name: p.name ?? p.title ?? p.pool_name ?? '(unnamed pool)',
        })).filter((p) => p.id)

        setPools(mapped)
        if (mapped.length && !poolId) setPoolId(String(mapped[0].id))
        if (!mapped.length) setMessage('No Talent Pools returned for user.')
      })
      .catch((e) => { setPools([]); setMessage(e?.message ?? 'Failed to load Talent Pools') })

    // ActiveCampaign Tags
    fetch('/api/activecampaign/tags', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) return setTags([])
        const raw = Array.isArray(data?.tags) ? data.tags : []
        const filtered = raw
          .filter((t: any) => String(t?.tag || '').trim().toLowerCase() !== 'customer')
          .sort((a: any, b: any) => String(a.tag).localeCompare(String(b.tag)))
        setTags(filtered)
      })
      .catch(() => setTags([]))
  }, [unlocked, poolId])

  const filteredTags = useMemo(
    () => tags.filter(t => t.tag.toLowerCase().includes(tagQuery.toLowerCase())),
    [tags, tagQuery]
  )

  async function retrievePoolCandidates() {
    setMessage('')
    if (!poolId) { setMessage('Select a Talent Pool'); return }
    setLoading(true)
    try {
      const qs = new URLSearchParams({ limit: String(SAMPLE_PREVIEW_LIMIT), rows: String(SAMPLE_PREVIEW_LIMIT) }).toString()
      const res = await fetch(`/api/vincere/talentpool/${encodeURIComponent(poolId)}/user/${encodeURIComponent(TP_USER_ID)}/candidates?${qs}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to fetch pool candidates (${res.status}): ${await res.text()}`)
      const data = await res.json()
      const rows: Candidate[] = Array.isArray(data?.candidates) ? data.candidates : []
      setCandidates(rows)

      const headerTotalStr = res.headers.get('x-vincere-total')
      const headerTotal = headerTotalStr && headerTotalStr.trim() !== '' ? Number(headerTotalStr) : NaN
      let total: number | null =
        typeof data?.meta?.total === 'number' ? data.meta.total :
        !Number.isNaN(headerTotal) ? headerTotal : null
      setPoolTotal(total)

      try {
        const cRes = await fetch(`/api/vincere/talentpool/${encodeURIComponent(poolId)}/count`, { cache: 'no-store' })
        if (cRes.ok) {
          const cData = await cRes.json().catch(() => ({}))
          const h2 = cRes.headers.get('x-vincere-total')
          const n2 = h2 && h2.trim() !== '' ? Number(h2) : NaN
          const t2 = typeof cData?.total === 'number' ? cData.total : !Number.isNaN(n2) ? n2 : null
          if (t2 != null) setPoolTotal(t2)
        }
      } catch {}

      if (!rows.length) setMessage('No candidates found in this pool.')
    } catch (e: any) {
      setMessage(e?.message ?? 'Failed to load candidates')
      setCandidates([]); setPoolTotal(null)
    } finally { setLoading(false) }
  }

  const acEnabled = (selectedTags.length > 0 || listName.trim().length > 0) && poolId !== ''

  async function sendToActiveCampaign() {
    setMessage(''); setSendState('starting')
    const effectiveTags = selectedTags.map(t => t.trim()).filter(Boolean)
    const tagString = effectiveTags.join(',')
    const effectiveList = listName.trim()
    if (!tagString && !effectiveList) { setSendState('error'); setMessage('Specify a Tag or List'); return }

    try {
      let createdListId: number | null = null
      if (effectiveList) {
        const lr = await fetch('/api/activecampaign/lists', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: effectiveList }),
        })
        const lj = await lr.json()
        if (!lr.ok || !lj?.id) { setSendState('error'); setMessage(lj?.error || `Failed to create list (${lr.status}).`); return }
        createdListId = Number(lj.id)
      }

      const res = await fetch('/api/activecampaign/import-pool/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId, userId: TP_USER_ID,
          tagName: tagString || undefined,
          listId: createdListId ?? undefined,
          rows: 200, max: 100000, chunk: 25, pauseMs: 150,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.jobId) { setSendState('error'); setMessage(data?.error || `Failed to start import (${res.status}).`); return }

      setSendState('sending')

      if (esRef.current) esRef.current.close()
      const es = new EventSource(`/api/activecampaign/import-pool/progress/${data.jobId}`)
      esRef.current = es
      es.onmessage = (evt) => {
        const payload: JobProgress = JSON.parse(evt.data || '{}')
        setProgress(payload)
        if (payload.status === 'done') { setSendState('success'); es.close(); esRef.current = null }
        else if (payload.status === 'error' || payload.status === 'not-found') {
          setSendState('error'); setMessage(payload.error || 'Import failed'); es.close(); esRef.current = null
        }
      }
      es.onerror = () => {}
    } catch (e: any) {
      setSendState('error'); setMessage(e?.message ?? 'Import failed')
    }
  }

  function handleSendClick() {
    if (!confirmSend) { setConfirmSend(true); return }
    setConfirmSend(false); sendToActiveCampaign()
  }

  const isSending = sendState === 'sending' || sendState === 'starting'
  const totalInPool = (progress?.totals?.poolTotal ?? poolTotal) ?? null
  const sent = progress?.totals?.sent ?? 0
  const denominator = (progress?.totals?.valid ?? totalInPool) ?? null
  const percent = denominator && denominator > 0 ? Math.min(100, Math.round((sent / denominator) * 100)) : 0
  const fmt = (n: number | null | undefined) => typeof n === 'number' ? new Intl.NumberFormat().format(n) : '—'
  const RING_SIZE = 360
  const RING_THICKNESS = 28
  const pctDeg = Math.max(0, Math.min(360, Math.round((percent / 100) * 360)))

  if (!unlocked) {
    return (
      <div className="relative min-h-[60vh]">
        <div className="absolute inset-0 grid place-items-center bg-white">
          <form onSubmit={tryUnlock} className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-center mb-4">
              <div className="text-4xl">🔒</div>
              <h2 className="mt-2 text-lg font-semibold">Restricted Area</h2>
              <p className="text-sm text-gray-600">Enter the password to access Active Campaign tools.</p>
            </div>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                className={`rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001961] ${pwError ? 'border-red-500' : ''}`}
                value={pw}
                onChange={(e) => { setPw(e.target.value); if (pwError) setPwError('') }}
                placeholder="••••••••" autoFocus
              />
            </label>
            {pwError && <div className="mt-2 text-sm text-red-600">{pwError}</div>}
            <button type="submit" className="mt-4 w-full rounded-full px-5 py-3 font-medium !bg-[#001961] !text-white hover:opacity-95">
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {/* Controls Card */}
      <div className="rounded-2xl border bg-white p-4">
        {/* Two columns: left = pool + list (stacked), right = tags panel */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* LEFT: Pool + List stacked */}
          <div className="grid gap-4">
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
                    <option value="" disabled>No Talent Pools</option>
                  ) : (
                    pools.map((p) => (
                      <option key={`${p.id}`} value={`${p.id}`}>{p.name}</option>
                    ))
                  )}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.116l3.71-2.885a.75.75 0 1 1 .92 1.18l-4.2 3.265a.75.75 0 0 1-.92 0L5.25 8.39a.75.75 0 0 1-.02-1.18z" />
                </svg>
              </div>
            </label>

            {/* Active Campaign List */}
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
          </div>

          {/* RIGHT: Tags panel */}
          <div className="grid gap-2 md:h-full">
            <span className="text-sm font-medium">Active Campaign Tag</span>

            {/* Selected chips */}
            <div className="flex flex-wrap gap-2 min-h-[2.25rem] rounded-xl border bg-white p-2">
              {selectedTags.length === 0 ? (
                <span className="text-xs text-gray-400 px-1 py-1">No tags selected</span>
              ) : (
                selectedTags.map(t => (
                  <span key={t} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm bg-gray-50">
                    {t}
                    <button
                      type="button"
                      onClick={() => setSelectedTags(prev => prev.filter(x => x !== t))}
                      className="text-gray-500 hover:text-gray-700"
                      aria-label={`Remove ${t}`}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Filter + list */}
            <div className="rounded-xl border overflow-hidden">
              <div className="border-b px-3 py-2">
                <input
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  placeholder="Search tags…"
                  className="w-full outline-none text-sm"
                />
              </div>
              <div className="max-h-48 overflow-auto">
                {filteredTags.map((t) => {
                  const checked = selectedTags.includes(t.tag)
                  return (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault()
                        setSelectedTags(prev => checked ? prev.filter(x => x !== t.tag) : [...prev, t.tag])
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
                  <div className="px-3 py-3 text-sm text-gray-500">No tags match your search.</div>
                )}
              </div>
            </div>
          </div>
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
            onClick={handleSendClick}
            disabled={!acEnabled || isSending}
            className={`ml-auto rounded-full px-5 py-3 font-medium shadow-sm transition 
              ${acEnabled && !isSending
                ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
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

        {/* Only show non-success errors/info */}
        {message && sendState !== 'success' && (
          <div className="mt-2 text-sm text-gray-700">{message}</div>
        )}
      </div>

      {/* Progress Card */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="text-[#001961] font-semibold text-lg">
          {selectedTags.length && listName.trim() ? (
            <>
              Tagging candidates as <span className="font-normal text-gray-600">“{selectedTags.join(', ')}”</span> and adding to list <span className="font-normal text-gray-600">“{listName.trim()}”</span>
            </>
          ) : selectedTags.length ? (
            <>Tagging candidates as <span className="font-normal text-gray-600">“{selectedTags.join(', ')}”</span></>
          ) : listName.trim() ? (
            <>Adding candidates to list <span className="font-normal text-gray-600">“{listName.trim()}”</span></>
          ) : (
            <>No tag or list specified</>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center">
          <div className="relative" style={{ width: 360, height: 360 }}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(#001961 ${pctDeg}deg, #e5e7eb 0)`,
                WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${RING_THICKNESS}px), black 0)`,
                mask: `radial-gradient(farthest-side, transparent calc(100% - ${RING_THICKNESS}px), black 0)`,
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))',
              }}
            />
            <div className="absolute rounded-full bg-white" style={{ inset: RING_THICKNESS, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)' }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-xs text-gray-500">{fmt(sent)} of {fmt(denominator)}</div>
              <div className="text-5xl font-bold text-[#001961] mt-1">{percent}%</div>
            </div>
          </div>
        </div>

        {progress?.status === 'error' && (
          <div className="mt-4 text-sm text-red-600">{progress?.error || 'Import failed'}</div>
        )}
      </div>
    </div>
  )
}

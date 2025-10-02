'use client'

import { useEffect, useState } from 'react'

type Pool = { id: string | number; name: string }
type Candidate = { first_name: string; last_name: string; email: string }
type Tag = { id: number; tag: string }

const TP_USER_ID = process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID || '29018'

export default function ActiveCampaignTab() {
  // Talent pools
  const [pools, setPools] = useState<Pool[]>([])
  const [poolId, setPoolId] = useState<string>('')

  // Candidates from selected pool
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Tags
  const [tags, setTags] = useState<Tag[]>([])
  const [tagName, setTagName] = useState('')
  const [tagMode, setTagMode] = useState<'select' | 'custom'>('select')

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
        )}/candidates`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`Failed to fetch pool candidates (${res.status}): ${t}`)
      }
      const data = await res.json()
      const rows: Candidate[] = Array.isArray(data?.candidates) ? data.candidates : []
      setCandidates(rows)
      if (!rows.length) setMessage('No candidates found in this pool.')
    } catch (e: any) {
      setMessage(e?.message ?? 'Failed to load candidates')
      setCandidates([])
    } finally {
      setLoading(false)
    }
  }

  async function sendToActiveCampaign() {
    setMessage('')
    const effectiveTag = tagMode === 'custom' ? tagName.trim() : tagName.trim()
    if (!effectiveTag) {
      setMessage('Select or enter a Tag')
      return
    }

    const prepared = candidates
      .filter((c) => c?.email && /\S+@\S+\.\S+/.test(c.email))
      .map((c) => ({
        first_name: c.first_name ?? '',
        last_name: c.last_name ?? '',
        email: c.email,
      }))

    if (!prepared.length) {
      setMessage('No candidates with valid emails.')
      return
    }

    try {
      const res = await fetch('/api/activecampaign/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: prepared,
          tagName: effectiveTag,
          excludeAutomations: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(
          `Import failed (${res.status}). ${
            typeof data === 'string' ? data : JSON.stringify(data)
          }`
        )
      } else {
        setMessage('Import requested. Check console for detailed results.')
        console.log('AC Import results:', data)
      }
    } catch (e: any) {
      setMessage(e?.message ?? 'Import failed')
    }
  }

  const cell = 'px-4 py-2'
  const acEnabled = (tagMode === 'custom' ? tagName.trim().length > 0 : tagName.trim().length > 0) && candidates.length > 0

  // Shared select styles + chevron
  const selectBase = 'w-full rounded-xl border px-3 py-2 appearance-none pr-9 focus:outline-none focus:ring-2 focus:ring-[#001961]'
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

  return (
    <div className="grid gap-6">
      {/* TOP PANEL: Controls (white card) */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Talent Pool select (with unified chevron) */}
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

          {/* Active Campaign Tag: select with "Custom..." option -> shows input when chosen */}
          <label className="grid gap-1">
            <span className="text-sm font-medium">Active Campaign Tag</span>
            <div className="grid gap-2">
              <div className="relative">
                <select
                  value={tagMode === 'custom' ? '__custom__' : tagName}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '__custom__') {
                      setTagMode('custom')
                      // leave tagName as-is so user can tweak existing text if any
                    } else {
                      setTagMode('select')
                      setTagName(v)
                    }
                  }}
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
                  <option value="__custom__">Custom…</option>
                </select>
                <SelectChevron />
              </div>

              {tagMode === 'custom' && (
                <input
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="Type a custom tag"
                  className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001961]"
                />
              )}
            </div>
          </label>
        </div>

        {/* Actions row: Retrieve on the left, Send on the right */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={retrievePoolCandidates}
            disabled={loading || !poolId}
            className={`rounded-full px-6 py-3 font-medium shadow-sm transition
              ${!loading && poolId
                ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
          >
            {loading ? 'Retrieving…' : 'Retrieve TP Candidates'}
          </button>

          <button
            onClick={sendToActiveCampaign}
            disabled={!acEnabled}
            className={`ml-auto rounded-full px-5 py-3 font-medium shadow-sm transition 
              ${acEnabled
                ? '!bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'}`}
          >
            Send to Active Campaign
          </button>
        </div>

        {message && <div className="mt-2 text-sm text-gray-700">{message}</div>}
      </div>

      {/* RESULTS PANEL: white card, no title, auto-expanding height */}
      <div className="rounded-2xl border bg-white">
        {/* Removed the "Candidates" header/title */}
        <div className="overflow-x-auto text-sm">
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
                      <td className={cell}>
                        {tagMode === 'custom'
                          ? (tagName || '').trim()
                          : (tagName || '').trim()}
                      </td>
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

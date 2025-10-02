'use client'

import { useEffect, useState } from 'react'

type Pool = { id: string | number; name: string }
type Candidate = { first_name: string; last_name: string; email: string }
type Tag = { id: number; tag: string }

export default function ActiveCampaignTab() {
  // Talent pools
  const [pools, setPools] = useState<Pool[]>([])
  const [poolId, setPoolId] = useState<string>('')

  // Candidates from selected pool
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Tag (free-type or pick from list)
  const [tags, setTags] = useState<Tag[]>([])
  const [tagName, setTagName] = useState('')

  // On tab mount: fetch Talent Pools (auto) and AC tags (optional UX)
  useEffect(() => {
    // Talent Pools for current user (hardcoded user_id handled server-side)
    fetch('/api/vincere/talentpools/user', { cache: 'no-store' })
      .then(async (r) => {
        const used = r.headers.get('x-vincere-userid') || ''
        if (!r.ok) {
          const errText = await r.text()
          throw new Error(`Pools fetch ${r.status}. userId=${used}. ${errText}`)
        }
        const data = await r.json()
        const raw = Array.isArray(data?.docs) ? data.docs
          : Array.isArray(data?.items) ? data.items
          : Array.isArray(data) ? data
          : []

        const mapped: Pool[] = raw.map((p: any) => ({
          id: p.id ?? p.pool_id ?? p.talent_pool_id ?? String(p?.uid ?? ''),
          name: p.name ?? p.title ?? p.pool_name ?? '(unnamed pool)',
        })).filter(p => p.id)

        setPools(mapped)
        if (mapped.length && !poolId) setPoolId(String(mapped[0].id))
        if (!mapped.length) setMessage(`No Talent Pools returned for user.`)
      })
      .catch((e) => {
        setPools([])
        setMessage(e?.message ?? 'Failed to load Talent Pools')
      })

    // AC tags (optional)
    fetch('/api/activecampaign/tags', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setTags(Array.isArray(data?.tags) ? data.tags : []))
      .catch(() => setTags([]))
  }, [])

  async function retrievePoolCandidates() {
    setMessage('')
    if (!poolId) { setMessage('Select a Talent Pool'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/vincere/talentpool/${encodeURIComponent(poolId)}/candidates`, { cache: 'no-store' })
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
    if (!tagName.trim()) { setMessage('Enter or select a Tag'); return }

    const prepared = candidates
      .filter(c => c?.email && /\S+@\S+\.\S+/.test(c.email))
      .map(c => ({
        first_name: c.first_name ?? '',
        last_name:  c.last_name ?? '',
        email:      c.email,
      }))

    if (!prepared.length) { setMessage('No candidates with valid emails.'); return }

    try {
      const res = await fetch('/api/activecampaign/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: prepared,
          tagName: tagName.trim(),
          // listIds removed as requested
          excludeAutomations: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(`Import failed (${res.status}). ${typeof data === 'string' ? data : JSON.stringify(data)}`)
      } else {
        setMessage('Import requested. Check console for detailed results.')
        console.log('AC Import results:', data)
      }
    } catch (e: any) {
      setMessage(e?.message ?? 'Import failed')
    }
  }

  const col = 'px-4 py-2'

  return (
    <div className="grid gap-4">
      {/* Pool + Tag selectors */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Talent Pool</span>
          <select
            value={poolId}
            onChange={e => setPoolId(e.target.value)}
            className="rounded-xl border px-3 py-2"
          >
            {pools.map(p => (
              <option key={`${p.id}`} value={`${p.id}`}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Active Campaign Tag</span>
          <div className="flex gap-2">
            <input
              value={tagName}
              onChange={e => setTagName(e.target.value)}
              placeholder="Type a tag or pick below"
              className="flex-1 rounded-xl border px-3 py-2"
              list="ac-tags"
            />
            <datalist id="ac-tags">
              {tags.map(t => <option key={t.id} value={t.tag} />)}
            </datalist>
          </div>
        </label>
      </div>

      <div className="flex gap-2">
        <button
          onClick={retrievePoolCandidates}
          disabled={loading || !poolId}
          className="rounded-2xl border px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Retrieving…' : 'Retrieve TP Candidates'}
        </button>

        <button
          onClick={sendToActiveCampaign}
          disabled={!tagName.trim() || candidates.length === 0}
          className="rounded-2xl border px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        >
          Send to Active Campaign
        </button>
      </div>

      {message && <div className="text-sm text-gray-700">{message}</div>}

      {/* Candidates table */}
      <div className="rounded-2xl border">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="text-sm font-medium">Candidates</div>
          <div className="text-xs text-gray-500">{candidates.length} loaded</div>
        </div>
        <div className="max-h-80 overflow-auto text-sm">
          {candidates.length === 0 ? (
            <div className="px-4 py-6 text-gray-500">No candidates loaded.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className={col}>First name</th>
                  <th className={col}>Surname</th>
                  <th className={col}>Email</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className={col}>{c.first_name || ''}</td>
                    <td className={col}>{c.last_name || ''}</td>
                    <td className={col}>{c.email || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

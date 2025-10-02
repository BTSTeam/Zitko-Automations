'use client'

import { useEffect, useState } from 'react'

type Pool = { id: string | number; name: string }
type Candidate = { first_name: string; last_name: string; email: string }
type Tag = { id: number; tag: string }

const TP_USER_ID = process.env.NEXT_PUBLIC_VINCERE_TALENTPOOL_USER_ID || '29018'

// ---------- Helpers: unwrap + normalize ----------
function unwrapToArray(json: any): any[] {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.items)) return json.items
  if (Array.isArray(json?.data?.items)) return json.data.items
  if (Array.isArray(json?.data)) return json.data
  if (Array.isArray(json?.candidates)) return json.candidates
  if (Array.isArray(json?.docs)) return json.docs
  if (Array.isArray(json?.results)) return json.results
  if (Array.isArray(json?.content)) return json.content  // 👈 add this line
  return []
}

function extractEmail(r: any): string | null {
  return (
    r?.email ??
    r?.work_email ??
    r?.email1 ??
    r?.primary_email ??
    r?.candidate_email ??
    r?.contact_email ??
    r?.emailAddress ??
    r?.candidate?.email ??
    r?.candidate?.work_email ??
    r?.contact?.email ??
    r?.person?.email ??
    (Array.isArray(r?.emails) && r.emails[0]?.email) ??
    (Array.isArray(r?.candidate?.emails) && r.candidate.emails[0]?.email) ??
    null
  )
}

function toUICandidate(r: any): Candidate {
  let first =
    r?.first_name ?? r?.firstName ?? r?.candidate?.first_name ?? r?.candidate?.firstName ?? ''
  let last =
    r?.last_name ?? r?.lastName ?? r?.candidate?.last_name ?? r?.candidate?.lastName ?? ''

  if ((!first || !last) && typeof r?.name === 'string') {
    const parts = r.name.trim().split(/\s+/)
    first = first || parts[0] || ''
    last = last || parts.slice(1).join(' ') || ''
  }

  const email = extractEmail(r)

  return {
    first_name: String(first || '').trim(),
    last_name: String(last || '').trim(),
    email: email ? String(email).trim() : '',
  }
}

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

  // On tab mount: fetch Talent Pools (auto) and AC tags
  useEffect(() => {
    fetch('/api/vincere/talentpools/user', { cache: 'no-store' })
      .then(async (r) => {
        const used = r.headers.get('x-vincere-userid') || ''
        if (!r.ok) {
          const errText = await r.text()
          throw new Error(`Pools fetch ${r.status}. userId=${used}. ${errText}`)
        }
        const data = await r.json()
        const arr: any[] = unwrapToArray(data)

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
      .then((data) => setTags(Array.isArray(data?.tags) ? data.tags : []))
      .catch(() => setTags([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const data = await res.json().catch(() => ({}))
      // Accept either { items: [...] }, { candidates: [...] }, or bare array shapes
      const arr = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.candidates)
        ? data.candidates
        : unwrapToArray(data)

      const rows: Candidate[] = arr.map(toUICandidate)

      setCandidates(rows)
      if (!rows.length) setMessage('No candidates found in this pool.')
      console.log('[TP] fetched candidates:', rows.length)
    } catch (e: any) {
      setMessage(e?.message ?? 'Failed to load candidates')
      setCandidates([])
    } finally {
      setLoading(false)
    }
  }

  async function sendToActiveCampaign() {
    setMessage('')
    if (!tagName.trim()) {
      setMessage('Enter or select a Tag')
      return
    }

    // Filter only at send-time (UI still shows all rows)
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
          tagName: tagName.trim(),
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

  const col = 'px-4 py-2'

  return (
    <div className="grid gap-6">
      {/* Top controls */}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Talent Pool</span>
          <select
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            className="rounded-xl border px-3 py-2"
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
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Active Campaign Tag</span>
          <div className="flex gap-2">
            <input
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Type a tag or pick below"
              className="flex-1 rounded-xl border px-3 py-2"
              list="ac-tags"
            />
            <datalist id="ac-tags">
              {tags.map((t) => (
                <option key={t.id} value={t.tag} />
              ))}
            </datalist>
          </div>
        </label>
      </div>

      {/* Primary actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={retrievePoolCandidates}
          disabled={loading || !poolId}
          className="rounded-full px-6 py-3 bg-[#f7931e] text-white font-medium shadow-sm hover:opacity-95 disabled:opacity-50"
        >
          {loading ? 'Retrieving…' : 'Retrieve TP Candidates'}
        </button>

        <button
          onClick={sendToActiveCampaign}
          disabled={!tagName.trim() || candidates.length === 0}
          className="rounded-full px-5 py-3 border font-medium hover:bg-gray-50 disabled:opacity-50"
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

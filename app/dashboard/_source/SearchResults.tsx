'use client'

import { useEffect, useMemo, useState } from 'react'

type SourceMode = 'candidates' | 'companies'

type Props = {
  mode: SourceMode
  results: any[] // API-normalized results array
  loading: boolean
}

/* ----------------------------- Helpers ----------------------------- */

/** Safe string accessor */
function s(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Build a stable id for selection even if `id` is missing */
function stableId(item: any, mode: SourceMode) {
  // Prefer explicit id if present
  if (item?.id) return String(item.id)
  if (mode === 'candidates') {
    const ln = s(item.linkedin_url) || s(item.linkedinUrl)
    const nm = s(item.name)
    const em = s(item.email)
    if (ln) return `cand:${ln}`
    if (nm && em) return `cand:${nm}|${em}`
    if (nm) return `cand:${nm}`
    return `cand:${Math.random().toString(36).slice(2)}`
  } else {
    const dom = s(item.domain) || s(item.primary_domain) || s(item.website_url)
    const nm = s(item.name)
    if (dom) return `comp:${dom}`
    if (nm) return `comp:${nm}`
    return `comp:${Math.random().toString(36).slice(2)}`
  }
}

/** Human-readable small tag */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
      {children}
    </span>
  )
}

/* ------------------------- Industry Modal -------------------------- */

function IndustryModal({
  open,
  onClose,
  onConfirm,
  mode,
  count,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (payload: { industryTag: string; note: string }) => void
  mode: SourceMode
  count: number
}) {
  const [industries, setIndustries] = useState<{ id?: string | number; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [industryTag, setIndustryTag] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    if (!open) return
    let mounted = true
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const res = await fetch('/api/sourcing/industries', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Industries error ${res.status}`)
        const json = await res.json()
        // Expecting: { industries: [{ id, name }, ...] } or array fallback
        const list = Array.isArray(json?.industries) ? json.industries : Array.isArray(json) ? json : []
        if (mounted) setIndustries(list.map((it: any) => ({ id: it?.id, name: s(it?.name) })))
      } catch (e: any) {
        if (mounted) setErr(e?.message || 'Failed to load industries.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
      <div className="card w-full max-w-xl p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">
            Add {mode === 'candidates' ? 'Candidate' : 'Company'}{count > 1 ? 's' : ''} to Vincere
          </h3>
          <p className="text-sm text-gray-600">
            Select an Industry and (optionally) include a note. ({count} selected)
          </p>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Industry</span>
            <select
              className="input"
              disabled={loading}
              value={industryTag}
              onChange={(e) => setIndustryTag(e.target.value)}
            >
              <option value="">Select an industry…</option>
              {industries.map((ind) => (
                <option key={`${ind.id ?? ind.name}`} value={ind.name}>
                  {ind.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Note (optional)</span>
            <textarea
              className="input min-h-[80px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. From Apollo sourcing run"
            />
          </label>

          {err && <div className="text-xs text-red-600">{err}</div>}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-brand"
            disabled={loading || !industryTag}
            onClick={() => onConfirm({ industryTag, note })}
          >
            {loading ? 'Loading…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------- Results Component ------------------------ */

export default function SearchResults({ mode, results, loading }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string>('')

  const normalized = useMemo(() => {
    // Normalize minimal fields we care about for rendering
    if (!Array.isArray(results)) return []
    return results.map((r: any) => {
      if (mode === 'candidates') {
        return {
          _raw: r,
          _id: stableId(r, 'candidates'),
          name: s(r.name),
          title: s(r.title) || s(r.current_title) || s(r.headline),
          email: s(r.email),
          email_status: s(r.email_status),
          linkedin_url: s(r.linkedin_url) || s(r.linkedinUrl),
          organization_name: s(r.organization_name) || s(r.organization?.name),
          organization_linkedin_url:
            s(r.organization_linkedin_url) ||
            s(r.organization?.linkedin_url) ||
            s(r.organization?.linkedinUrl),
          people_auto_score: typeof r.people_auto_score === 'number' ? r.people_auto_score : undefined,
          location: s(r.present_raw_address) || s(r.current_location_name) || s(r.location),
        }
      } else {
        return {
          _raw: r,
          _id: stableId(r, 'companies'),
          name: s(r.name),
          domain: s(r.domain) || s(r.primary_domain),
          website_url: s(r.website_url),
          linkedin_url: s(r.linkedin_url) || s(r.linkedinUrl),
          location: s(r.location) || s(r.headquarters_address),
          job_postings: Boolean(r.job_postings || r.has_job_postings || r.active_job_postings),
          rapid_growth:
            Boolean(r.rapid_growth || r.headcount_growth || r.growth_signal) ||
            false,
          contacts: Array.isArray(r.contacts) ? r.contacts : [],
        }
      }
    })
  }, [results, mode])

  const allIds = useMemo(() => normalized.map((x: any) => x._id), [normalized])
  const allSelected = selected.size > 0 && allIds.every((id) => selected.has(id))

  useEffect(() => {
    // Reset selection when results change
    setSelected(new Set())
  }, [results, mode])

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === 0 || !allSelected) {
        return new Set(allIds)
      }
      return new Set()
    })
  }

  const selectedItems = useMemo(
    () => normalized.filter((n: any) => selected.has(n._id)),
    [normalized, selected],
  )

  const handleConfirmAdd = async ({ industryTag, note }: { industryTag: string; note: string }) => {
    setSubmitting(true)
    setStatusMsg('')
    try {
      const endpoint =
        mode === 'candidates' ? '/api/sourcing/addCandidate' : '/api/sourcing/addCompany'
      const payload =
        mode === 'candidates'
          ? {
              candidates: selectedItems.map((x) => x._raw),
              industryTag,
              note,
            }
          : {
              companies: selectedItems.map((x) => x._raw),
              industryTag,
              note,
            }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.error || `Failed with status ${res.status}`)
      }

      setStatusMsg('Success: items have been sent to Vincere.')
      setShowModal(false)
      // Optionally clear selection on success
      setSelected(new Set())
    } catch (e: any) {
      setStatusMsg(`Error: ${e?.message || 'Failed to add to Vincere.'}`)
    } finally {
      setSubmitting(false)
      // Clear status after a short delay
      setTimeout(() => setStatusMsg(''), 4000)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="btn btn-sm btn-outline" onClick={toggleAll} disabled={loading || normalized.length === 0}>
            {allSelected ? 'Clear All' : 'Select All'}
          </button>
          <span className="text-sm text-gray-600">
            {selected.size} selected / {normalized.length} results
          </span>
          {loading && <span className="text-sm text-gray-600">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm btn-brand"
            disabled={selected.size === 0 || submitting}
            onClick={() => setShowModal(true)}
            title={`Add selected ${mode === 'candidates' ? 'candidates' : 'companies'} to Vincere`}
          >
            Add to Vincere
          </button>
        </div>
      </div>

      {/* Status line */}
      {statusMsg ? (
        <div
          className={`text-sm ${
            statusMsg.startsWith('Success') ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {statusMsg}
        </div>
      ) : null}

      {/* Results list */}
      <div className="grid gap-3">
        {normalized.length === 0 && !loading ? (
          <div className="text-sm text-gray-500">No results to display.</div>
        ) : null}

        {normalized.map((item: any) => {
          const checked = selected.has(item._id)
          if (mode === 'candidates') {
            return (
              <div key={item._id} className="border rounded-xl p-3 grid gap-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="checkbox mt-1"
                      checked={checked}
                      onChange={() => toggleRow(item._id)}
                      aria-label={`Select ${item.name || 'candidate'}`}
                    />
                    <div>
                      <div className="font-semibold">
                        {item.name || 'Unknown'}{' '}
                        {item.people_auto_score != null && (
                          <span className="ml-2">
                            <Tag>Score: {item.people_auto_score}</Tag>
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-700">{item.title || '—'}</div>
                      <div className="text-sm text-gray-600">{item.location || '—'}</div>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div>{item.email ? <a className="link" href={`mailto:${item.email}`}>{item.email}</a> : '—'}</div>
                    <div className="truncate">
                      {item.linkedin_url ? (
                        <a className="link" href={item.linkedin_url} target="_blank" rel="noreferrer">
                          LinkedIn
                        </a>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-700">
                    {item.organization_name ? (
                      <>
                        Org:&nbsp;<span className="font-medium">{item.organization_name}</span>
                      </>
                    ) : (
                      'Org: —'
                    )}
                  </div>
                  <div className="text-right">
                    {item.organization_linkedin_url ? (
                      <a className="link" href={item.organization_linkedin_url} target="_blank" rel="noreferrer">
                        Org LinkedIn
                      </a>
                    ) : (
                      <span className="text-gray-500">Org LinkedIn: —</span>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          // companies
          return (
            <div key={item._id} className="border rounded-xl p-3 grid gap-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox mt-1"
                    checked={checked}
                    onChange={() => toggleRow(item._id)}
                    aria-label={`Select ${item.name || 'company'}`}
                  />
                  <div>
                    <div className="font-semibold">{item.name || 'Unknown'}</div>
                    <div className="text-sm text-gray-700">{item.domain || item.website_url || '—'}</div>
                    <div className="text-sm text-gray-600">{item.location || '—'}</div>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="truncate">
                    {item.linkedin_url ? (
                      <a className="link" href={item.linkedin_url} target="_blank" rel="noreferrer">
                        LinkedIn
                      </a>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[12px]">
                <div className="flex flex-wrap gap-2">
                  {item.job_postings && <Tag>Job Postings</Tag>}
                  {item.rapid_growth && <Tag>Rapid Growth</Tag>}
                </div>
                {Array.isArray(item.contacts) && item.contacts.length > 0 ? (
                  <div className="text-gray-700">
                    Contacts:&nbsp;<span className="font-medium">{item.contacts.length}</span>
                  </div>
                ) : (
                  <div className="text-gray-500">Contacts: 0</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add-to-Vincere modal */}
      <IndustryModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirmAdd}
        mode={mode}
        count={selectedItems.length}
      />
    </div>
  )
}

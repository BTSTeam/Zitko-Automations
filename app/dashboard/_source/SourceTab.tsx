// app/dashboard/_source/SourceTab.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type SourceMode = 'candidates' | 'companies'
type EmpType = 'permanent' | 'contract'

type ResultItem = {
  id: string
  name?: string
  title?: string
  company?: string
  location?: string
  linkedin_url?: string
}

export default function SourceTab() {
  const [mode, setMode] = useState<SourceMode>('candidates')
  const [empType, setEmpType] = useState<EmpType>('permanent')

  // Single search panel state
  const [jobTitle, setJobTitle] = useState('')
  const [locations, setLocations] = useState('') // comma-separated or a single string
  const [keywords, setKeywords] = useState('')   // optional extra field
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ResultItem[]>([])
  const [searched, setSearched] = useState(false)

  const titleLabel = mode === 'candidates' ? 'Candidate Search' : 'Company Search'
  const resultsTitle = mode === 'candidates' ? 'Candidate Results' : 'Company Results'

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    setSearched(true)
    setResults([])

    try {
      const params = new URLSearchParams()
      if (jobTitle.trim()) params.set('title', jobTitle.trim())
      if (locations.trim()) params.set('locations', locations.trim())
      if (keywords.trim()) params.set('keywords', keywords.trim())
      params.set('empType', empType)

      const url =
        mode === 'candidates'
          ? `/api/sourcing/people?${params.toString()}`
          : `/api/sourcing/companies?${params.toString()}`

      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Search failed (${res.status}): ${text || res.statusText}`)
      }
      const data = await res.json()
      setResults(Array.isArray(data?.results) ? data.results : [])
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setJobTitle('')
    setLocations('')
    setKeywords('')
    setResults([])
    setSearched(false)
    setError(null)
  }

  return (
    <div className="relative mx-auto max-w-6xl w-full space-y-6">
      {/* Header: Mode + Emp Type */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            className={`px-4 py-2 text-sm font-medium ${mode === 'candidates' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
            onClick={() => setMode('candidates')}
            type="button"
          >
            Candidates
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-l border-gray-200 ${mode === 'companies' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
            onClick={() => setMode('companies')}
            type="button"
          >
            Companies
          </button>
        </div>

        {mode === 'candidates' && (
          <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              className={`px-4 py-2 text-sm font-medium ${empType === 'permanent' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => setEmpType('permanent')}
              type="button"
            >
              Permanent
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-l border-gray-200 ${empType === 'contract' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => setEmpType('contract')}
              type="button"
            >
              Contract
            </button>
          </div>
        )}
      </div>

      {/* ===== Single Search Panel (ALL fields live here) ===== */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">{titleLabel}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Reset
            </button>
            <button
              onClick={runSearch}
              className="px-4 py-1.5 text-sm rounded-lg bg-[#F7941D] text-white hover:brightness-110"
            >
              Search
            </button>
          </div>
        </div>

        <form onSubmit={runSearch} className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Job Title ABOVE Locations */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={mode === 'candidates' ? 'e.g. Fire Alarm Engineer' : 'e.g. Fire & Security Integrator'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F7941D]"
            />
          </div>

          {/* Locations */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Locations</label>
            <input
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
              placeholder="e.g. London, Cambridge, Manchester"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F7941D]"
            />
            <p className="text-xs text-gray-500 mt-1">Tip: comma-separate multiple locations.</p>
          </div>

          {/* Optional: Keywords */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (optional)</label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. Gent, Honeywell, Access Control"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F7941D]"
            />
          </div>

          {/* Submit (mobile friendly duplication) */}
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#F7941D] text-white text-sm font-medium hover:brightness-110"
            >
              Search
            </button>
          </div>
        </form>

        {error && (
          <div className="px-5 pb-5">
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
              {error}
            </div>
          </div>
        )}
      </section>

      {/* ===== Results Panel (separate, below) ===== */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">{resultsTitle}</h2>
          {searched && (
            <span className="text-xs text-gray-500">
              {loading ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}
            </span>
          )}
        </div>

        <div className="p-5">
          {!searched && (
            <p className="text-sm text-gray-500">Run a search to see results here.</p>
          )}

          {searched && !loading && results.length === 0 && !error && (
            <p className="text-sm text-gray-500">No results found. Try adjusting your filters.</p>
          )}

          {loading && (
            <div className="text-sm text-gray-600">Loading…</div>
          )}

          {!loading && results.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {results.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {mode === 'candidates'
                          ? (r.name || r.title || 'Unknown')
                          : (r.name || r.company || 'Unknown Company')}
                      </div>
                      <div className="text-sm text-gray-600">
                        {r.title ? `${r.title} • ` : ''}{r.location || 'Location N/A'}
                      </div>
                    </div>
                    {r.linkedin_url && (
                      <a
                        className="text-sm underline underline-offset-2 hover:opacity-80"
                        href={r.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View LinkedIn
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

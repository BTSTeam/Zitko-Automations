'use client'

import { useEffect, useState } from 'react'

type SourceMode = 'candidates' | 'companies'

type Person = {
  id: string
  name: string
  company: string | null
  location: string | null
  linkedin_url: string | null
  autoScore: number | null
}

const SENIORITY_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'founder', label: 'Founder' },
  { value: 'c_suite', label: 'C-suite' },
  { value: 'partner', label: 'Partner' },
  { value: 'vp', label: 'VP' },
  { value: 'head', label: 'Head' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior', label: 'Senior' },
  { value: 'entry', label: 'Entry' },
  { value: 'intern', label: 'Intern' },
]

// Full-screen maintenance overlay
function DownOverlay() {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-white/90 backdrop-blur-sm">
      <div className="text-center px-6">
        <div className="text-6xl mb-4">🛠️</div>
        <h3 className="text-xl font-semibold mb-2">
          Sourcing Tool is down due to technical difficulties
        </h3>
        <p className="text-gray-600 text-sm">Please check back later.</p>
      </div>
    </div>
  )
}

export default function SourceTab({ mode }: { mode: SourceMode }) {
  // Toggle overlay via env var
  const isDown =
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === '1' ||
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === 'true'

  // ---- COMPANIES TAB (placeholder) ----
  if (mode === 'companies') {
    return (
      <div className="card p-6 relative">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏗️</div>
          <h3 className="text-xl font-semibold mb-2">Building In Process…</h3>
          <p className="text-gray-600">
            This Companies sourcing page will host a similar search soon.
          </p>
        </div>
        {isDown && <DownOverlay />}
      </div>
    )
  }

  // ---- CANDIDATES TAB ----
  // Inputs mapped 1:1 to Apollo params
  const [personTitlesInput, setPersonTitlesInput] = useState('')       // maps to person_titles[]
  const [includeSimilarTitles, setIncludeSimilarTitles] = useState(true)
  const [qKeywords, setQKeywords] = useState('')                       // maps to q_keywords
  const [personLocationsInput, setPersonLocationsInput] = useState('') // maps to person_locations[]
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>([]) // person_seniorities[]
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Person[]>([])

  function toArray(input: string): string[] {
    return input
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (isDown) return

    setLoading(true)
    setError(null)
    setResults([])

    try {
      const payload = {
        person_titles: toArray(personTitlesInput),
        include_similar_titles: includeSimilarTitles,
        q_keywords: qKeywords.trim(),
        person_locations: toArray(personLocationsInput),
        person_seniorities: selectedSeniorities,
        page,
        per_page: perPage,
      }

      const res = await fetch('/api/apollo/people-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || `Search failed (${res.status})`)
      }

      const arr: Person[] = Array.isArray(data.people) ? data.people : []
      setResults(arr)
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  // Allow Cmd/Ctrl+Enter to trigger search
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        runSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="card p-6 relative space-y-6">
      {/* Panel 1: Search form */}
      <form onSubmit={runSearch} className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-lg font-semibold m-0">Apollo People Search</h3>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="btn btn-brand"
              disabled={isDown || loading}
              title="Run search"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>

        {/* Row: Titles / Include similar / Keywords */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Person Titles <span className="text-gray-400">(person_titles[])</span>
            </label>
            <input
              className="input"
              placeholder="e.g. Field Service Technician, Field Service Engineer"
              value={personTitlesInput}
              onChange={(e) => setPersonTitlesInput(e.target.value)}
              disabled={isDown}
            />
            <label className="mt-2 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-brand h-4 w-4"
                checked={includeSimilarTitles}
                onChange={(e) => setIncludeSimilarTitles(e.target.checked)}
                disabled={isDown}
              />
              Include similar titles
              <span className="text-gray-400">(include_similar_titles)</span>
            </label>
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Keywords <span className="text-gray-400">(q_keywords)</span>
            </label>
            <input
              className="input"
              placeholder="A string of words to filter results, e.g. Fire, IR35, Pay Rate"
              value={qKeywords}
              onChange={(e) => setQKeywords(e.target.value)}
              disabled={isDown}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Person Locations <span className="text-gray-400">(person_locations[])</span>
            </label>
            <input
              className="input"
              placeholder="e.g. United States, California, United Kingdom, London"
              value={personLocationsInput}
              onChange={(e) => setPersonLocationsInput(e.target.value)}
              disabled={isDown}
            />
          </div>
        </div>

        {/* Seniorities */}
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">
            Seniorities <span className="text-gray-400">(person_seniorities[])</span>
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SENIORITY_OPTIONS.map((opt) => (
              <label key={opt.value} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand h-4 w-4"
                  checked={selectedSeniorities.includes(opt.value)}
                  onChange={(e) =>
                    setSelectedSeniorities((prev) =>
                      e.target.checked
                        ? [...prev, opt.value]
                        : prev.filter((v) => v !== opt.value)
                    )
                  }
                  disabled={isDown}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Pagination controls */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Page <span className="text-gray-400">(page)</span>
            </label>
            <input
              type="number"
              min={1}
              className="input"
              value={page}
              onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
              disabled={isDown}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Per Page <span className="text-gray-400">(per_page)</span>
            </label>
            <select
              className="input"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              disabled={isDown}
            >
              {[25, 50, 100, 150, 200].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </form>

      {/* Panel 2: Results */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <div className="font-medium">Results</div>
          <div className="text-sm text-gray-600">
            {loading
              ? 'Searching…'
              : results.length
              ? `${results.length} candidate${results.length === 1 ? '' : 's'}`
              : 'No results'}
          </div>
        </div>

        {error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : results.length === 0 && !loading ? (
          <div className="p-6 text-sm text-gray-500">
            Enter your criteria above and click <strong>Search</strong> to view people.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-white">
                  <th className="px-4 py-2 border-b">Candidate</th>
                  <th className="px-4 py-2 border-b">Company</th>
                  <th className="px-4 py-2 border-b">Location</th>
                  <th className="px-4 py-2 border-b">LinkedIn</th>
                  <th className="px-4 py-2 border-b">Auto-Score</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr key={p.id} className="odd:bg-gray-50">
                    <td className="px-4 py-2 border-b">{p.name || '—'}</td>
                    <td className="px-4 py-2 border-b">{p.company || '—'}</td>
                    <td className="px-4 py-2 border-b">{p.location || '—'}</td>
                    <td className="px-4 py-2 border-b">
                      {p.linkedin_url ? (
                        <a
                          href={p.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand underline"
                        >
                          View Profile
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 border-b">
                      {p.autoScore != null ? p.autoScore.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isDown && <DownOverlay />}
    </div>
  )
}

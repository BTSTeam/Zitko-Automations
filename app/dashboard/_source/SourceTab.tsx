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

// Minimal mapper for Apollo "contacts" -> UI Person
function mapApolloContactToPerson(c: any): Person {
  const first = (c?.first_name ?? '').toString().trim()
  const last = (c?.last_name ?? '').toString().trim()
  const name =
    (typeof c?.name === 'string' && c.name.trim()) ||
    [first, last].filter(Boolean).join(' ').trim() ||
    '—'

  const company =
    (typeof c?.organization_name === 'string' && c.organization_name.trim()) ||
    (typeof c?.organization?.name === 'string' && c.organization.name.trim()) ||
    null

  const location =
    (typeof c?.present_raw_address === 'string' && c.present_raw_address.trim()) ||
    (c?.location?.name ??
      [c?.city, c?.state, c?.country].filter(Boolean).join(', ')) ||
    null

  const linkedin_url =
    typeof c?.linkedin_url === 'string' && c.linkedin_url ? c.linkedin_url : null

  const autoScore =
    typeof c?.people_auto_score === 'number'
      ? c.people_auto_score
      : typeof c?.auto_score === 'number'
      ? c.auto_score
      : null

  return {
    id: c?.id ?? '',
    name,
    company,
    location,
    linkedin_url,
    autoScore,
  }
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
  const [personTitlesInput, setPersonTitlesInput] = useState('')       // -> person_titles[]
  const [qKeywords, setQKeywords] = useState('')                       // -> q_keywords
  const [personLocationsInput, setPersonLocationsInput] = useState('') // -> person_locations[]
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>([]) // -> person_seniorities[]

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Person[]>([])

  // For quick debugging/visibility of Apollo payload/response
  const [showRaw, setShowRaw] = useState(false)
  const [rawText, setRawText] = useState<string>('')

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
    setRawText('')

    try {
      const payload = {
        person_titles: toArray(personTitlesInput),
        include_similar_titles: true, // always true
        q_keywords: qKeywords.trim(),
        person_locations: toArray(personLocationsInput),
        person_seniorities: selectedSeniorities,
        page: 1,
        per_page: 25, // always 25
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

      // Primary: use server-mapped people
      let people: Person[] = Array.isArray(data.people) ? data.people : []

      // Fallback: parse Apollo "raw" if people came back empty
      if ((!people || people.length === 0) && typeof data.raw === 'string' && data.raw.trim()) {
        try {
          const parsed = JSON.parse(data.raw)
          const contacts = Array.isArray(parsed?.contacts) ? parsed.contacts : []
          if (contacts.length) {
            people = contacts.map(mapApolloContactToPerson)
          }
        } catch {
          // ignore parse error; we'll just show no results
        }
      }

      setResults(people || [])

      // keep raw visible for debugging
      if (typeof data.raw === 'string') {
        setRawText(data.raw)
      } else if (data && Object.keys(data).length) {
        setRawText(JSON.stringify(data, null, 2))
      }
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
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={showRaw}
                onChange={(e) => setShowRaw(e.target.checked)}
              />
              Show raw response
            </label>
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

        {/* Row: Titles / Keywords / Locations */}
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
        </div>
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

      {/* Raw response (debug) */}
      {showRaw && (
        <pre className="mt-3 text-[12px] leading-snug p-3 rounded-xl border bg-gray-50 overflow-auto max-h-80 whitespace-pre-wrap">
          {rawText || '—'}
        </pre>
      )}

      {isDown && <DownOverlay />}
    </div>
  )
}

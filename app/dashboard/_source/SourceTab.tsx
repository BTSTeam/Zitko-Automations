'use client'

import { useEffect, useMemo, useState } from 'react'

type SourceMode = 'candidates' | 'companies'

type Person = {
  id: string
  name: string
  title: string | null
  company: string | null
  linkedin_url: string | null
}

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
  // Toggle overlay via env var (set to "1" or "true")
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

  // ---- CANDIDATES TAB (Apollo people search) ----
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [keywords, setKeywords] = useState('') // company keyword in Apollo
  const [roleType, setRoleType] = useState<'permanent' | 'contract'>('permanent')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Person[]>([])

  // Derived “effective keywords” just for the hint below the input
  const effectiveKeywordsHint = useMemo(() => {
    const parts: string[] = []
    if (keywords.trim()) parts.push(keywords.trim())
    if (roleType === 'contract') {
      parts.push('IR35', 'pay rate')
    } else {
      parts.push('-IR35', '-pay rate')
    }
    return parts.join(' ')
  }, [keywords, roleType])

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (isDown) return
  
    setLoading(true)
    setError(null)
    setResults([])
  
    try {
      const payload = {
        title: title.trim(),          // can be comma-separated; server splits
        location: location.trim(),    // can be comma-separated; server splits
        keywords: keywords.trim(),
        type: roleType,               // 'permanent' | 'contract'
        emailStatus: 'verified',      // default in route, but explicit is fine
        page: 1,
        perPage: 100
      }
  
      const res = await fetch('/api/apollo/people-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
  
      const data = await res.json().catch(() => ({}))
  
      if (!res.ok) {
        throw new Error(data?.error || `Search failed (${res.status})`)
      }
  
      setResults(Array.isArray(data.people) ? data.people.slice(0, 100) : [])
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  // Allow Enter to submit when focused in any field
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        // optional: Ctrl/Cmd+Enter quick search
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
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold m-0">Apollo People Search</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Role Type</label>
            <select
              className="input"
              value={roleType}
              onChange={(e) =>
                setRoleType(e.target.value as 'permanent' | 'contract')
              }
              disabled={isDown}
            >
              <option value="permanent">Permanent</option>
              <option value="contract">Contract</option>
            </select>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Job Title</label>
            <input
              className="input"
              placeholder="e.g. Fire & Security Engineer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isDown}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Location</label>
            <input
              className="input"
              placeholder="e.g. London, UK"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isDown}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Company Keywords (Apollo)
            </label>
            <input
              className="input"
              placeholder="e.g. CCTV, access control, fire alarm"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={isDown}
            />
            <p className="text-xs text-gray-500 mt-1">
              Effective keywords:{' '}
              <code className="text-[11px]">{effectiveKeywordsHint || '—'}</code>
            </p>
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
            Enter your criteria above and click <strong>Search</strong> to view
            up to 100 people.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-white">
                  <th className="px-4 py-2 border-b">Candidate</th>
                  <th className="px-4 py-2 border-b">Job Title</th>
                  <th className="px-4 py-2 border-b">Company</th>
                  <th className="px-4 py-2 border-b">LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr key={p.id} className="odd:bg-gray-50">
                    <td className="px-4 py-2 border-b">{p.name || '—'}</td>
                    <td className="px-4 py-2 border-b">{p.title || '—'}</td>
                    <td className="px-4 py-2 border-b">{p.company || '—'}</td>
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

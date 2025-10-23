'use client'

import { useEffect, useRef, useState } from 'react'

type SourceMode = 'candidates' | 'companies'

type Person = {
  id: string
  name: string | null
  title: string | null
  organization_name: string | null
  formatted_address: string | null
  linkedin_url: string | null
  facebook_url: string | null
  headline: string | null
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

// -------------------------------
// Small brand icons
// -------------------------------
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className || 'h-4 w-4'} fill="currentColor">
      <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM0 8h5v16H0zM8 8h4.8v2.2h.07c.67-1.2 2.3-2.46 4.73-2.46 5.05 0 5.98 3.33 5.98 7.66V24h-5v-7.2c0-1.72-.03-3.94-2.4-3.94-2.4 0-2.77 1.87-2.77 3.8V24H8z" />
    </svg>
  )
}
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className || 'h-4 w-4'} fill="currentColor">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.03 3.66 9.2 8.44 9.94v-7.03H7.9v-2.9h2.54V9.41c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.25.2 2.25.2v2.47h-1.27c-1.25 0-1.64.78-1.64 1.58v1.9h2.79l-.45 2.9h-2.34V22c4.78-.74 8.44-4.91 8.44-9.94z" />
    </svg>
  )
}

// -------------------------------
// ChipInput – press Enter / comma to add
// -------------------------------
function ChipInput({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  'aria-label'?: string
}) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  function addChipFromDraft() {
    const clean = draft.trim()
    if (!clean) return
    if (!value.includes(clean)) onChange([...value, clean])
    setDraft('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault()
      addChipFromDraft()
    } else if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      e.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="min-h-[40px] w-full rounded-xl border px-2 py-1.5 flex items-center flex-wrap gap-2 bg-white">
      {value.map((chip, idx) => (
        <span
          key={`${chip}-${idx}`}
          className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm"
        >
          {chip}
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700"
            aria-label={`Remove ${chip}`}
            onClick={() => onChange(value.filter((c) => c !== chip))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        className="flex-1 min-w-[120px] outline-none text-sm placeholder:text-gray-400 bg-transparent py-1"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addChipFromDraft}
      />
    </div>
  )
}

// -------------------------------
// MultiSelect dropdown (shows chips when closed)
// -------------------------------
function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: {
  options: { value: string; label: string }[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const selected = options.filter((o) => value.includes(o.value))

  function toggle(val: string) {
    if (value.includes(val)) onChange(value.filter((v) => v !== val))
    else onChange([...value, val])
  }

  return (
    <div className="relative" ref={ref} aria-label={ariaLabel}>
      <button
        type="button"
        className="w-full min-h-[40px] rounded-xl border px-2 py-1.5 text-left bg-white"
        onClick={() => setOpen((s) => !s)}
      >
        {selected.length === 0 ? (
          <span className="text-sm text-gray-400">{placeholder || 'Select…'}</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selected.map((s) => (
              <span key={s.value} className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm">
                {s.label}
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-700"
                  aria-label={`Remove ${s.label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(s.value)
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border bg-white shadow-lg p-2 max-h-64 overflow-auto">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-orange-500"
                checked={value.includes(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// -------------------------------
// Maintenance overlay (optional via env)
// -------------------------------
function DownOverlay() {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-white/90 backdrop-blur-sm">
      <div className="text-center px-6">
        <div className="text-6xl mb-4">🛠️</div>
        <h3 className="text-xl font-semibold mb-2">Sourcing Tool is down due to technical difficulties</h3>
        <p className="text-gray-600 text-sm">Please check back later.</p>
      </div>
    </div>
  )
}

// -------------------------------
// Main component
// -------------------------------
export default function SourceTab({ mode }: { mode: SourceMode }) {
  const isDown =
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === '1' ||
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === 'true'

  // Companies tab placeholder
  if (mode === 'companies') {
    return (
      <div className="card p-6 relative">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏗️</div>
          <h3 className="text-xl font-semibold mb-2">Building In Process…</h3>
          <p className="text-gray-600">This Companies sourcing page will host a similar search soon.</p>
        </div>
        {isDown && <DownOverlay />}
      </div>
    )
  }

  // Inputs mapped 1:1 to Apollo params
  const [titles, setTitles] = useState<string[]>([])          // person_titles[]
  const [locations, setLocations] = useState<string[]>([])    // person_locations[]
  const [keywords, setKeywords] = useState<string[]>([])      // q_keywords (joined)
  const [seniorities, setSeniorities] = useState<string[]>([])// person_seniorities[]

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Person[]>([])

  const [showRaw, setShowRaw] = useState(false)
  const [rawText, setRawText] = useState<string>('')

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (isDown) return

    setLoading(true)
    setError(null)
    setResults([])
    setRawText('')

    try {
      const payload = {
        person_titles: titles,
        include_similar_titles: true,
        q_keywords: keywords.join(', '), // Apollo expects a string; join chips
        person_locations: locations,
        person_seniorities: seniorities,
        page: 1,
        per_page: 25,
      }

      const res = await fetch('/api/apollo/people-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Search failed (${res.status})`)
      setResults(Array.isArray(data.people) ? data.people : [])
      setRawText(data?.apollo_pretty || '')
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  // Cmd/Ctrl+Enter to search
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) runSearch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="card p-6 relative space-y-6">
      {/* Search form */}
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
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full bg-orange-500 text-white px-4 py-2 text-sm hover:bg-orange-600"
                title="Request an advanced search"
              >
                Request
              </button>
              <button
                type="submit"
                className="rounded-full bg-orange-500 text-white px-4 py-2 text-sm hover:bg-orange-600"
                disabled={isDown || loading}
                title="Run search"
              >
                {loading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>
        </div>

        {/* Inputs row – chip style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Person Titles <span className="text-gray-400">(person_titles[])</span>
            </label>
            <ChipInput
              aria-label="Person titles"
              value={titles}
              onChange={setTitles}
              placeholder="e.g. CISO, CSO, Field Service Technician"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Person Locations <span className="text-gray-400">(person_locations[])</span>
            </label>
            <ChipInput
              aria-label="Person locations"
              value={locations}
              onChange={setLocations}
              placeholder="e.g. United States, California, London"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">
              Keywords <span className="text-gray-400">(q_keywords)</span>
            </label>
            <ChipInput
              aria-label="Keywords"
              value={keywords}
              onChange={setKeywords}
              placeholder="e.g. IR35, Pay Rate, Fire"
            />
          </div>
        </div>

        {/* Seniorities – multiselect dropdown with chips */}
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">
            Seniorities <span className="text-gray-400">(person_seniorities[])</span>
          </label>
          <MultiSelect
            aria-label="Seniorities"
            options={SENIORITY_OPTIONS}
            value={seniorities}
            onChange={setSeniorities}
            placeholder="Select seniorities"
          />
        </div>
      </form>

      {/* Results – stacked rows */}
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
          <ul className="divide-y">
            {results.map((p) => (
              <li key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {/* Row 1: Name + social icons */}
                    <div className="flex items-center gap-3">
                      <div className="text-base font-semibold truncate">{p.name || '—'}</div>
                      <div className="flex items-center gap-2 text-gray-500">
                        {p.linkedin_url ? (
                          <a
                            href={p.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex p-1 rounded hover:text-orange-600"
                            title="Open LinkedIn"
                          >
                            <LinkedInIcon />
                          </a>
                        ) : (
                          <span className="inline-flex p-1 opacity-30">
                            <LinkedInIcon />
                          </span>
                        )}
                        {p.facebook_url ? (
                          <a
                            href={p.facebook_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex p-1 rounded hover:text-orange-600"
                            title="Open Facebook"
                          >
                            <FacebookIcon />
                          </a>
                        ) : (
                          <span className="inline-flex p-1 opacity-30">
                            <FacebookIcon />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Company - Title (Headline) */}
                    <div className="text-sm mt-1">
                      <span className="font-medium">{p.organization_name || '—'}</span>
                      {p.title ? ` - ${p.title}` : ''}
                      {p.headline ? <span className="text-gray-600"> ({p.headline})</span> : null}
                    </div>

                    {/* Row 3: Address */}
                    <div className="text-sm text-gray-600 mt-2">
                      {p.formatted_address || '—'}
                    </div>
                  </div>

                  {/* Create button (no action wired) */}
                  <button
                    type="button"
                    className="self-center rounded-full bg-orange-500 text-white px-5 py-2 text-sm hover:bg-orange-600"
                    title="Create"
                  >
                    Create
                  </button>
                </div>
              </li>
            ))}
          </ul>
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

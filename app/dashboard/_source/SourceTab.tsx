'use client'

import { useEffect, useRef, useState } from 'react'

type SourceMode = 'candidates' | 'companies'

type Person = {
  id: string
  name: string | null
  title: string | null
  organization_name: string | null
  formatted_address: string | null
  headline: string | null
  linkedin_url: string | null
  facebook_url: string | null
}

const SENIORITIES = [
  'owner','founder','c_suite','partner','vp','head','director','manager','senior','entry','intern',
] as const

// ---------------- UI helpers ----------------
function useChipInput(initial: string[] = []) {
  const [chips, setChips] = useState<string[]>(initial)
  const [input, setInput] = useState('')

  function addChipFromInput() {
    const v = input.trim()
    if (!v) return
    if (!chips.includes(v)) setChips(prev => [...prev, v])
    setInput('')
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addChipFromInput()
    } else if (e.key === 'Backspace' && !input && chips.length) {
      // remove last
      setChips(prev => prev.slice(0, -1))
    }
  }
  function removeChip(v: string) {
    setChips(prev => prev.filter(c => c !== v))
  }

  return { chips, input, setInput, addChipFromInput, onKeyDown, removeChip, setChips }
}

function Chip({ children, onRemove }: { children: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm">
      <span className="truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full w-5 h-5 grid place-items-center hover:bg-gray-200"
        title="Remove"
      >
        ×
      </button>
    </span>
  )
}

function IconLinkedIn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="fill-[#0a66c2]">
      <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM0 8h5v16H0zM8 8h4.8v2.2h.07c.67-1.27 2.32-2.6 4.77-2.6 5.1 0 6.05 3.36 6.05 7.73V24h-5v-7.1c0-1.69-.03-3.86-2.35-3.86-2.35 0-2.71 1.83-2.71 3.74V24H8z" />
    </svg>
  )
}
function IconFacebook() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="fill-[#1877f2]">
      <path d="M22.675 0H1.325C.593 0 0 .593 0 1.326V22.67c0 .73.593 1.325 1.325 1.325h11.495V14.71H9.692v-3.59h3.128V8.414c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.796.715-1.796 1.763v2.314h3.59l-.467 3.59h-3.123V24h6.125c.73 0 1.325-.594 1.325-1.325V1.326C24 .593 23.405 0 22.675 0z" />
    </svg>
  )
}

// Multi-select dropdown with checkboxes
function MultiSelect({
  label,
  options,
  values,
  setValues,
  placeholder = 'Select…',
}: {
  label: string
  options: string[]
  values: string[]
  setValues: (v: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  function toggle(value: string) {
    setValues(values.includes(value) ? values.filter(v => v !== value) : [...values, value])
  }

  return (
    <div className="flex flex-col" ref={ref}>
      <label className="text-sm text-gray-600 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full rounded-xl border px-3 py-2 text-sm text-left bg-white"
      >
        {values.length ? (
          <div className="flex flex-wrap gap-2">
            {values.map(v => (
              <span key={v} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase">
                {v.replace('_', ' ')}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border bg-white shadow-lg max-h-60 overflow-auto z-10">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={values.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span className="uppercase">{opt.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- Main ----------------
export default function SourceTab({ mode }: { mode: SourceMode }) {
  const isDown =
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === '1' ||
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === 'true'

  if (mode === 'companies') {
    return (
      <div className="card p-6 relative">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏗️</div>
          <h3 className="text-xl font-semibold mb-2">Building In Process…</h3>
          <p className="text-gray-600">This Companies sourcing page will host a similar search soon.</p>
        </div>
      </div>
    )
  }

  // Chips: titles, locations, keywords
  const titles = useChipInput([])
  const locations = useChipInput(['United States'])
  const keywords = useChipInput([])

  const [seniorities, setSeniorities] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (isDown) return
    setLoading(true)
    setError(null)
    setPeople([])

    try {
      const payload = {
        person_titles: titles.chips,
        person_locations: locations.chips,
        person_seniorities: seniorities,
        q_keywords: keywords.chips, // server joins with spaces
        page: 1,
        per_page: 25,
      }
      const res = await fetch('/api/apollo/people-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `Search failed (${res.status})`)
      setPeople(Array.isArray(json.people) ? json.people : [])
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  // Cmd/Ctrl + Enter to search
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) runSearch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="space-y-4">
      {/* -------- Panel 1: Search -------- */}
      <form onSubmit={runSearch} className="rounded-2xl border bg-white shadow-sm p-4">
        <h3 className="font-semibold mb-3">Apollo People Search</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Person Titles (chips) */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Person Titles <span className="text-gray-400">(person_titles[])</span>
            </label>
            <div className="rounded-xl border px-2 py-1.5">
              <div className="flex flex-wrap gap-2">
                {titles.chips.map(v => (
                  <Chip key={v} onRemove={() => titles.removeChip(v)}>{v}</Chip>
                ))}
                <input
                  className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                  placeholder="e.g. Field Service Technician"
                  value={titles.input}
                  onChange={(e) => titles.setInput(e.target.value)}
                  onKeyDown={titles.onKeyDown}
                  disabled={isDown}
                />
              </div>
            </div>
          </div>

          {/* Person Locations (chips) */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Person Locations <span className="text-gray-400">(person_locations[])</span>
            </label>
            <div className="rounded-xl border px-2 py-1.5">
              <div className="flex flex-wrap gap-2">
                {locations.chips.map(v => (
                  <Chip key={v} onRemove={() => locations.removeChip(v)}>{v}</Chip>
                ))}
                <input
                  className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                  placeholder="e.g. United States, California"
                  value={locations.input}
                  onChange={(e) => locations.setInput(e.target.value)}
                  onKeyDown={locations.onKeyDown}
                  disabled={isDown}
                />
              </div>
            </div>
          </div>

          {/* Keywords (chips) */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Keywords <span className="text-gray-400">(q_keywords)</span>
            </label>
            <div className="rounded-xl border px-2 py-1.5">
              <div className="flex flex-wrap gap-2">
                {keywords.chips.map(v => (
                  <Chip key={v} onRemove={() => keywords.removeChip(v)}>{v}</Chip>
                ))}
                <input
                  className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                  placeholder="e.g. Fire, IR35"
                  value={keywords.input}
                  onChange={(e) => keywords.setInput(e.target.value)}
                  onKeyDown={keywords.onKeyDown}
                  disabled={isDown}
                />
              </div>
            </div>
          </div>

          {/* Seniorities (multi-select dropdown) */}
          <MultiSelect
            label="Seniorities (person_seniorities[])"
            options={SENIORITIES as unknown as string[]}
            values={seniorities}
            setValues={setSeniorities}
            placeholder="Choose one or more seniorities"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Press <kbd className="px-1 border rounded">Enter</kbd> to add a chip. Use <kbd className="px-1 border rounded">Cmd/Ctrl</kbd> + <kbd className="px-1 border rounded">Enter</kbd> to search.
          </span>
          <button
            type="submit"
            className="rounded-full bg-orange-500 text-white px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            disabled={isDown || loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {/* -------- Panel 2: Results -------- */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="px-4 py-3 border-b">
          <h4 className="font-semibold">Results</h4>
        </div>

        {error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : people.length === 0 && !loading ? (
          <div className="p-6 text-sm text-gray-500">
            Enter your criteria above and click <strong>Search</strong> to view people.
          </div>
        ) : (
          <ul className="divide-y">
            {people.map((p) => (
              <li key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">{p.name || '—'}</span>
                      <div className="flex items-center gap-2">
                        {p.linkedin_url && (
                          <a href={p.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn">
                            <IconLinkedIn />
                          </a>
                        )}
                        {p.facebook_url && (
                          <a href={p.facebook_url} target="_blank" rel="noreferrer" title="Facebook">
                            <IconFacebook />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="text-sm mt-1">
                      <span className="font-medium">{p.organization_name || '—'}</span>
                      {p.title ? <> — <span>{p.title}</span></> : null}
                      {p.headline ? (
                        <span className="text-gray-500">  ({p.headline})</span>
                      ) : null}
                    </div>

                    <div className="text-sm text-gray-700 mt-1">
                      {p.formatted_address || '—'}
                    </div>
                  </div>

                  <div className="shrink-0">
                    <button
                      type="button"
                      className="rounded-full bg-orange-500 text-white px-6 py-2 text-sm font-medium"
                      title="Create"
                      // no handler yet
                    >
                      Create
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

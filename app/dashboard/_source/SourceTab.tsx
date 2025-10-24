'use client'

import { useEffect, useRef, useState } from 'react'

type SourceMode = 'candidates' | 'companies'

type EmploymentItem = {
  organization_name: string | null
  title: string | null
  start_date: string | null
  end_date: string | null
  current?: boolean | null
}

type Person = {
  id: string
  name: string | null
  title: string | null
  organization_name: string | null
  organization_website_url: string | null
  formatted_address: string | null
  linkedin_url: string | null
  facebook_url: string | null
  employment_history: EmploymentItem[]
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
      <button type="button" onClick={onRemove} className="rounded-full w-5 h-5 grid place-items-center hover:bg-gray-200" title="Remove">×</button>
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
function IconGlobe({ muted }: { muted?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={muted ? 'text-gray-300' : 'text-gray-700'}>
      <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm7.93 9h-3.086a15.4 15.4 0 0 0-1.02-5.02A8.01 8.01 0 0 1 19.93 11ZM12 4c.94 1.24 1.66 3.12 1.98 5H10.02C10.34 7.12 11.06 5.24 12 4ZM8.176 6.98A15.4 15.4 0 0 0 7.156 12H4.07a8.01 8.01 0 0 1 4.106-5.02ZM4.07 13h3.086a15.4 15.4 0 0 0 1.02 5.02A8.01 8.01 0 0 1 4.07 13ZM12 20c-.94-1.24-1.66-3.12-1.98-5h3.96C13.66 16.88 12.94 18.76 12 20Zm3.824-1.98A15.4 15.4 0 0 0 16.844 13h3.086a8.01 8.01 0 0 1-4.106 5.02ZM16.844 12a13.5 13.5 0 0 1-1.047-4H8.203a13.5 13.5 0 0 1-1.047 4h9.688Z"/>
    </svg>
  )
}

// absolute dropdown so the panel height doesn’t change
function MultiSelect({
  label, options, values, setValues, placeholder = 'Select…',
}: {
  label: string; options: string[]; values: string[]; setValues: (v: string[]) => void; placeholder?: string
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
    <div className="flex flex-col relative" ref={ref}>
      <label className="text-sm text-gray-600 mb-1">{label}</label>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full rounded-xl border px-3 py-2.5 text-sm text-left bg-white">
        {values.length ? (
          <div className="flex flex-wrap gap-2">
            {values.map(v => (
              <span key={v} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase">{v.replace('_', ' ')}</span>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 rounded-xl border bg-white shadow-lg max-h-60 overflow-auto z-20">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
              <input type="checkbox" className="h-4 w-4" checked={values.includes(opt)} onChange={() => toggle(opt)} />
              <span className="uppercase">{opt.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- date formatting: "Sept – 2025"
function formatMonthYear(input: string | null | undefined): string {
  if (!input) return '—'
  // Accepts YYYY-MM-DD, YYYY-MM, YYYY
  const s = String(input).trim()
  const [y, m] = s.split('-')
  const year = y && /^\d{4}$/.test(y) ? y : ''
  const monthNum = m ? parseInt(m, 10) : NaN
  const months = [ '', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec' ]
  const month = Number.isFinite(monthNum) ? months[Math.max(0, Math.min(12, monthNum))] : ''
  return `${month || '—'} – ${year || '—'}`
}

// --- static LinkedIn note builder (no AI)
function makeStaticNote(firstName?: string | null) {
  const first = (firstName || '').trim() || 'there'
  return `Hi ${first}, it's always nice to meet others passionate about the industry. Would be great to connect.`
}

// Map raw Apollo contact/person → Person
function transformToPerson(p: any): Person {
  const first = (p?.first_name ?? '').toString().trim()
  const last = (p?.last_name ?? '').toString().trim()
  const name = (p?.name && String(p.name).trim()) || [first, last].filter(Boolean).join(' ').trim() || null
  const title =
    (p?.title && String(p.title).trim()) ||
    (Array.isArray(p?.employment_history) && p.employment_history[0]?.title) ||
    null
  const organization_name =
    (Array.isArray(p?.employment_history) && p.employment_history[0]?.organization_name) ||
    (p?.organization?.name && String(p.organization.name).trim()) ||
    null
  const organization_website_url =
    (p?.organization?.website_url && String(p.organization.website_url).trim()) || null
  const formatted_address =
    (typeof p?.formatted_address === 'string' && p.formatted_address.trim()) ||
    (typeof p?.present_raw_address === 'string' && p.present_raw_address.trim()) ||
    ([p?.city, p?.state, p?.country].filter(Boolean).join(', ') || null)
  const linkedin_url = (typeof p?.linkedin_url === 'string' && p.linkedin_url) || null
  const facebook_url = (typeof p?.facebook_url === 'string' && p.facebook_url) || null

  const employment_history: EmploymentItem[] = Array.isArray(p?.employment_history)
    ? p.employment_history.map((eh: any) => ({
        organization_name: eh?.organization_name ? String(eh.organization_name).trim() : null,
        title: eh?.title ? String(eh.title).trim() : null,
        start_date: eh?.start_date ? String(eh.start_date).trim() : null,
        end_date: eh?.end_date ? String(eh.end_date).trim() : null,
        current: !!eh?.current,
      }))
    : []

  // Sort with current first (fallback: most recent by end_date/start_date)
  employment_history.sort((a, b) => {
    if (a.current && !b.current) return -1
    if (b.current && !a.current) return 1
    const aKey = (a.end_date || a.start_date || '').toString()
    const bKey = (b.end_date || b.start_date || '').toString()
    return bKey.localeCompare(aKey) // descending
  })

  return {
    id: p?.id ?? '',
    name,
    title: title ? String(title).trim() : null,
    organization_name: organization_name ? String(organization_name).trim() : null,
    organization_website_url,
    formatted_address,
    linkedin_url,
    facebook_url,
    employment_history,
  }
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
          <div className="text-6xl mb-4">️</div>
          <h3 className="text-xl font-semibold mb-2">️Building In Process…</h3>
          <p className="text-gray-600">This Companies sourcing page will host a similar search soon.</p>
        </div>
      </div>
    )
  }

  // Chips: titles, locations, keywords
  const titles = useChipInput([])
  const locations = useChipInput([]) // (no default)
  const keywords = useChipInput([])

  const [seniorities, setSeniorities] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [searchOpen, setSearchOpen] = useState(true) // NEW: collapsed by default

  // NEW: notes state + copied indicator
  const [notesById, setNotesById] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Prefilled email for Advanced Search (fixed subject)
  const mailToSubject = "Advanced Search Request"
  
  const mailToBody = `Hi BTS Team,
  
  Please can I request an advanced search with the criteria listed below, thank you.
  
  JOB TITLES:
    - EXCLUDE:
    
  PAST JOB TITLES:
  
  LOCATIONS:
  
  CITY RADIUS: (Provide city and radius within X miles)
  
  COMPANY NAME: (For full list of employees only)
    - EXCLUDE:
    
  SENIORITIES:
  
  COMPANY KEYWORDS:
    - EXCLUDE:
    
  PEOPLE LOOKALIKES: (Provide full names & current company name)
  
  COMPANY LOOKALIKES: (Provide full company names)
  
  Kind regards,`
    
  // Encoded params for the mailto link
  const subjectEncoded = encodeURIComponent(mailToSubject)
  const bodyEncoded = encodeURIComponent(mailToBody)

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // NEW: copy-then-open LinkedIn icon behaviour
  const onLinkedInClick = async (
    e: React.MouseEvent,
    url?: string,
    id?: string
  ) => {
    if (!url) return
    e.preventDefault()

    const note = id ? notesById[id] : ''
    if (note) {
      try {
        await navigator.clipboard.writeText(note)
        setCopiedId(id || null)
        setTimeout(() => setCopiedId(null), 1200)
      } catch {
        // ignore clipboard errors; still open LinkedIn
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (isDown) return
    setLoading(true)
    setError(null)
    setPeople([])
    setExpanded(new Set())

    try {
      const payload = {
        person_titles: titles.chips,
        person_locations: locations.chips,
        person_seniorities: seniorities,
        q_keywords: keywords.chips,
        page: 1,
        per_page: 25,
      }
      const res = await fetch('/api/apollo/people-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json: any = await res.json()
      if (!res.ok) throw new Error(json?.error || `Search failed (${res.status})`)
      let rawArr: any[] = []
      if (Array.isArray(json.people) && json.people.length) rawArr = json.people
      else if (Array.isArray(json.apollo?.contacts) && json.apollo.contacts.length) rawArr = json.apollo.contacts
      else if (Array.isArray(json.apollo?.people)) rawArr = json.apollo.people

      // map and set
      const mapped: Person[] = rawArr.map(transformToPerson)
      setPeople(mapped)

      // build static notes per candidate (no AI)
      const built: Record<string, string> = {}
      for (const p of mapped) {
        const firstName = (p.name || '').split(' ')?.[0] || ''
        built[p.id] = makeStaticNote(firstName)
      }
      setNotesById(built)

      // OPTIONAL: persist notes for later reuse (safe to keep even if route not added yet)
      try {
        await fetch('/api/notes/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: Object.entries(built).map(([candidateId, note]) => ({ candidateId, note }))
          })
        })
      } catch {
        // ignore persistence failures
      }

    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setSearchOpen(false)
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
      {/* -------- Panel 1: Search (collapsible, collapsed by default) -------- */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setSearchOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3"
          aria-expanded={searchOpen}
        >
          <h3 className="font-semibold">Candidate | Contact Search</h3>
          <svg
            width="16" height="16" viewBox="0 0 20 20" fill="currentColor"
            className={searchOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
          >
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
          </svg>
        </button>

        {searchOpen && (
          <form onSubmit={runSearch} className="p-4 pt-0">
            {/* grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Titles */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Job Titles</label>
                <div className="rounded-xl border px-2 py-1.5">
                  <div className="flex flex-wrap gap-2">
                    {titles.chips.map(v => (
                      <Chip key={v} onRemove={() => titles.removeChip(v)}>{v}</Chip>
                    ))}
                    <input
                      className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                      placeholder="e.g. Field Service Technician"
                      value={titles.input}
                      onChange={e => titles.setInput(e.target.value)}
                      onKeyDown={titles.onKeyDown}
                      disabled={isDown}
                    />
                  </div>
                </div>
              </div>

              {/* Locations */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Locations</label>
                <div className="rounded-xl border px-2 py-1.5">
                  <div className="flex flex-wrap gap-2">
                    {locations.chips.map(v => (
                      <Chip key={v} onRemove={() => locations.removeChip(v)}>{v}</Chip>
                    ))}
                    <input
                      className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                      placeholder="e.g. California, United States"
                      value={locations.input}
                      onChange={e => locations.setInput(e.target.value)}
                      onKeyDown={locations.onKeyDown}
                      disabled={isDown}
                    />
                  </div>
                </div>
              </div>

              {/* Keywords */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Keywords</label>
                <div className="rounded-xl border px-2 py-1.5">
                  <div className="flex flex-wrap gap-2">
                    {keywords.chips.map(v => (
                      <Chip key={v} onRemove={() => keywords.removeChip(v)}>{v}</Chip>
                    ))}
                    <input
                      className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                      placeholder="e.g. Fire, IR35"
                      value={keywords.input}
                      onChange={e => keywords.setInput(e.target.value)}
                      onKeyDown={keywords.onKeyDown}
                      disabled={isDown}
                    />
                  </div>
                </div>
              </div>

              {/* Seniorities */}
              <MultiSelect
                label="Seniorities"
                options={SENIORITIES as unknown as string[]}
                values={seniorities}
                setValues={setSeniorities}
                placeholder="Choose one or more seniorities"
              />
            </div>

            {/* Tips & Search button */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Please press <kbd className="px-1 border rounded">Enter</kbd> to submit your search criteria for each field.
              </span>
              <button
                type="submit"
                className="rounded-full bg-orange-500 text-white px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                disabled={isDown || loading}
              >
                {loading ? 'Searching…' : 'Search'}
              </button>
            </div>

            {/* Advanced search: mailto link (fixed subject) */}
            <div className="mt-3 flex justify-end">
              <div className="text-right text-xs text-gray-500">
                If you would like to request a more advanced search, please click{' '}
                <a
                  href={`mailto:bts@zitko.co.uk?subject=${subjectEncoded}&body=${bodyEncoded}`}
                  className="text-orange-500 hover:text-orange-600 no-underline"
                >
                  here
                </a>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* -------- Panel 2: Results (no title bar) -------- */}
      <div className="rounded-2xl border bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : people.length === 0 && !loading ? (
          <div className="p-6 text-sm text-gray-500">
            Enter your criteria above and click <strong>Search</strong> to view people.
          </div>
        ) : (
          <ul className="divide-y">
            {people.map(p => {
              const hasLI = !!p.linkedin_url
              const hasFB = !!p.facebook_url
              const hasWWW = !!p.organization_website_url

              return (
                <li key={p.id} className="p-4">
                  {/* Row 1: Name  |  Location (small)  +  always-on icons far right */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-base truncate">{p.name || '—'}</span>
                      {p.formatted_address ? (
                        <>
                          <span className="text-gray-300">|</span>
                          <span className="text-xs text-gray-600 truncate">{p.formatted_address}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      {/* LinkedIn: copy note then open */}
                      <a
                        href={hasLI ? p.linkedin_url! : undefined}
                        onClick={hasLI ? (ev) => onLinkedInClick(ev, p.linkedin_url!, p.id) : undefined}
                        className={hasLI ? '' : 'opacity-30 pointer-events-none cursor-default'}
                        title={
                          hasLI
                            ? (copiedId === p.id ? 'Note copied!' : 'Open LinkedIn (note copies first)')
                            : 'LinkedIn not available'
                        }
                      >
                        <IconLinkedIn />
                      </a>

                      <a href={hasFB ? p.facebook_url! : undefined}
                         target={hasFB ? '_blank' : undefined}
                         rel={hasFB ? 'noreferrer' : undefined}
                         className={hasFB ? '' : 'opacity-30 pointer-events-none cursor-default'}
                         title={hasFB ? 'Open Facebook' : 'Facebook not available'}>
                        <IconFacebook />
                      </a>
                      <a href={hasWWW ? p.organization_website_url! : undefined}
                         target={hasWWW ? '_blank' : undefined}
                         rel={hasWWW ? 'noreferrer' : undefined}
                         className={hasWWW ? 'text-gray-700 hover:text-gray-900' : 'opacity-30 pointer-events-none cursor-default'}
                         title={hasWWW ? 'Open company website' : 'Company website not available'}>
                        <IconGlobe muted={!hasWWW} />
                      </a>
                    </div>
                  </div>

                  {/* Row 2: Job Title (above) + Organization (not bold) + toggle far right */}
                  <div className="mt-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm">{p.title || '—'}</div>
                      <div className="text-sm flex items-center gap-2">
                        <span className="truncate">{p.organization_name || '—'}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpanded(p.id)}
                      className="text-sm text-gray-700 hover:text-gray-900 inline-flex items-center gap-1"
                      title="Toggle employment history"
                    >
                      Employment history
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
                           className={expanded.has(p.id) ? 'rotate-180 transition-transform' : 'transition-transform'}>
                        <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
                      </svg>
                    </button>
                  </div>

                  {/* Collapsible: Employment history */}
                  {expanded.has(p.id) && (
                    <div className="mt-3 rounded-xl border bg-gray-50">
                      {/* Column headers */}
                      <div className="px-3 py-2 border-b grid grid-cols-1 md:grid-cols-4 md:gap-3 text-xs text-gray-500">
                        <div>Company</div>
                        <div>Job Title</div>
                        <div>Start Date</div>
                        <div>End Date</div>
                      </div>

                      <ul className="text-xs">
                        {p.employment_history.length ? (
                          p.employment_history.map((eh, idx) => {
                            const isCurrent = !!eh.current || eh.end_date === null
                            const rowClass = isCurrent ? 'text-orange-500' : ''
                            return (
                              <li key={idx} className={`px-3 py-2 border-t first:border-t-0 ${rowClass}`}>
                                <div className="grid grid-cols-1 md:grid-cols-4 md:gap-3">
                                  <div>{eh.organization_name || '—'}</div>
                                  <div>{eh.title || '—'}</div>
                                  <div>{formatMonthYear(eh.start_date)}</div>
                                  <div>{eh.end_date ? formatMonthYear(eh.end_date) : 'Present'}</div>
                                </div>
                              </li>
                            )
                          })
                        ) : (
                          <li className="px-3 py-2 border-t first:border-t-0 text-gray-500">No history available.</li>
                        )}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

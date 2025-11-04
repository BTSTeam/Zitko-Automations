'use client'

import { useEffect, useRef, useState } from 'react'

// Mode indicates which sourcing tab is currently active
type SourceMode = 'people' | 'companies'

// ---------- Shared Types ----------
type EmploymentItem = {
  organization_name: string | null
  title: string | null
  start_date: string | null
  end_date: string | null
  current?: boolean | null
}

type Company = {
  id: string
  name: string | null
  website_url: string | null
  linkedin_url: string | null
  exact_location?: string | null
  // from GET /organizations/{id}
  city?: string | null
  state?: string | null
  short_description?: string | null
  // enrichments
  job_postings?: any[]
  hiring_people?: any[]
  news_articles?: any[]
}

function formatCityState(c: Company) {
  const city = (c.city || '').trim()
  const state = (c.state || '').trim()
  if (city && state) return `${city}, ${state}`
  return city || state || null
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

// ---------- Company-related Types ----------
type JobPosting = {
  id: string
  title: string | null
  location: string | null
  employment_type: string | null
  remote: boolean | null
  url: string | null
}
type HiringPerson = Person
type NewsArticle = {
  id: string
  title: string | null
  description: string | null
  published_at: string | null
  url: string | null
}

// Seniority options reused from original file
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

// Simple multi-select component used for seniorities
function MultiSelect({
  label, options, values, setValues, placeholder = 'Select…',
}: {
  label: string; options: string[]; values: string[]; setValues: (v: string[]) => void; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

function toggleOpt(opt: string) {
  const next = values.includes(opt)
    ? values.filter(o => o !== opt)
    : [...values, opt]
  setValues(next)
}

  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <div ref={ref} className="relative rounded-xl border px-2 py-1.5">
        <button
          type="button"
          className="w-full text-left flex items-center justify-between"
          onClick={() => setOpen(o => !o)}
        >
          <span className={`truncate text-sm ${values.length ? '' : 'text-gray-400'}`}>{values.length ? values.join(', ') : placeholder}</span>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className={open ? 'rotate-180 transition-transform' : 'transition-transform'}>
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-xl shadow-sm max-h-60 overflow-y-auto text-sm">
            {options.map(opt => (
              <label key={opt} className="block px-3 py-1 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={values.includes(opt)}
                  onChange={() => toggleOpt(opt)}
                  className="mr-2"
                />
                {opt}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper to build static note text for LinkedIn copy
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
  const organization_website_url = (p?.organization?.website_url && String(p.organization.website_url).trim()) || null
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

function formatMonthYear(date: string | null): string {
  if (!date) return '—'
  try {
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return '—'
    const month = d.toLocaleString('default', { month: 'short' })
    const year = d.getFullYear()
    return `${month} ${year}`
  } catch {
    return '—'
  }
}

// ---------------- Main Component ----------------
export default function SourceTab({ mode }: { mode: SourceMode }) {
  // Determine if sourcing endpoints are disabled via environment flag
  const isDown =
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === '1' ||
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === 'true'

  // ------ People search state ------
  const personTitles = useChipInput([])
  const personLocations = useChipInput([])
  const personKeywords = useChipInput([])
  const [personSeniorities, setPersonSeniorities] = useState<string[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [peopleError, setPeopleError] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [peopleExpanded, setPeopleExpanded] = useState<Set<string>>(new Set())
  const [peopleSearchOpen, setPeopleSearchOpen] = useState(true)
  const [notesById, setNotesById] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Advanced search mailto for people
  const mailToSubject = 'Advanced Search Request (people)'
  const mailToBody = `Hi BTS Team,

Please can I request an advanced search with the criteria listed below, thank you.

Job Titles:
  - Exclude:

Past Job Titles:

Locations:

City Radius: (provide city and radius within X miles)

Company Name: (for full list of employees only)
  - Exclude:

Seniorities:

Company Keywords:
  - Exclude:

People Lookalikes: (provide full names & current company name)

Company Lookalikes: (Provide full company names)

Kind regards,`
  const subjectEncoded = encodeURIComponent(mailToSubject)
  const bodyEncoded = encodeURIComponent(mailToBody)

  // Toggle expanded employment history for a person
  function togglePersonExpanded(id: string) {
    setPeopleExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Copy note then open LinkedIn (used for people and hiring contacts)
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

  // Perform the people search via API
  async function runPeopleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (isDown) return
    setPeopleLoading(true)
    setPeopleError(null)
    setPeople([])
    setPeopleExpanded(new Set())
    try {
      const payload = {
        person_titles: personTitles.chips,
        person_locations: personLocations.chips,
        person_seniorities: personSeniorities,
        q_keywords: personKeywords.chips,
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
      const mapped: Person[] = rawArr.map(transformToPerson)
      setPeople(mapped)
      // Build static notes for each candidate
      const built: Record<string, string> = {}
      for (const p of mapped) {
        const firstName = (p.name || '').split(' ')?.[0] || ''
        built[p.id] = makeStaticNote(firstName)
      }
      setNotesById(built)
      // Optional: persist notes (safe even if route not implemented)
      try {
        await fetch('/api/notes/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: Object.entries(built).map(([candidateId, note]) => ({ candidateId, note })) }),
        })
      } catch {
        // ignore persistence failures
      }
    } catch (err: any) {
      setPeopleError(err?.message || 'Unexpected error')
    } finally {
      setPeopleSearchOpen(false)
      setPeopleLoading(false)
    }
  }

  // ------ Company search state ------
  const companyLocations = useChipInput([])
  const companyKeywords = useChipInput([])
  const [companyLoading, setCompanyLoading] = useState(false)
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [companySearchOpen, setCompanySearchOpen] = useState(true)
  // Track which sections are expanded per company
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [expandedHiring, setExpandedHiring] = useState<Set<string>>(new Set())
  const [expandedNews, setExpandedNews] = useState<Set<string>>(new Set())

  function toggleJobPostings(id: string) {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleHiringPeople(id: string) {
    setExpandedHiring(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleNewsArticles(id: string) {
    setExpandedNews(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Perform the company search via API
  async function runCompanySearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (isDown) return
    setCompanyLoading(true)
    setCompanyError(null)
    setCompanies([])
    setExpandedJobs(new Set())
    setExpandedHiring(new Set())
    setExpandedNews(new Set())
    try {
      const payload = {
        locations: companyLocations.chips,
        keywords: companyKeywords.chips,
        page: 1,
        per_page: 25,
      }
      const res = await fetch('/api/apollo/company-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json: any = await res.json()
      if (!res.ok) throw new Error(json?.error || `Search failed (${res.status})`)
      const arr: any[] = Array.isArray(json.companies) ? json.companies : []
      
      // Map to Company type with defensive checks
      const mapped: Company[] = arr.map((c: any) => {
        const job_postings: JobPosting[] = Array.isArray(c?.job_postings)
          ? c.job_postings.map((jp: any) => ({
              id: (jp?.id ?? jp?.job_posting_id ?? jp?.job_posting_url ?? '').toString(),
              title: jp?.title ?? jp?.job_title ?? null,
              location: jp?.location ?? jp?.formatted_location ?? null,
              employment_type: jp?.employment_type ?? jp?.job_type ?? null,
              remote: typeof jp?.remote === 'boolean' ? jp.remote : null,
              url: jp?.url ?? jp?.job_posting_url ?? null,
            }))
          : []
        const hiring_people: HiringPerson[] = Array.isArray(c?.hiring_people)
          ? c.hiring_people.map((p: any) => transformToPerson(p))
          : []
        const news_articles: NewsArticle[] = Array.isArray(c?.news_articles)
          ? c.news_articles.map((a: any) => ({
              id: (a?.id ?? a?.article_id ?? '').toString(),
              title: a?.title ?? null,
              description: a?.description ?? a?.summary ?? null,
              published_at: a?.published_at ?? a?.published_date ?? null,
              url: a?.url ?? a?.article_url ?? null,
            }))
          : []
        return {
          id: (c?.id ?? c?.organization_id ?? '').toString(),
          name: c?.name ?? c?.company_name ?? null,
          website_url: c?.website_url ?? c?.domain ?? null,
          linkedin_url: c?.linkedin_url ?? null,
          exact_location: c?.formatted_address ?? c?.location ?? null,
          city: c?.city ?? null,
          state: c?.state ?? null,
          short_description: c?.short_description ?? null,
      
          job_postings,
          hiring_people,
          news_articles,
        }
      })
      setCompanies(mapped)
    } catch (err: any) {
      setCompanyError(err?.message || 'Unexpected error')
    } finally {
      setCompanySearchOpen(false)
      setCompanyLoading(false)
    }
  }

  // Register Ctrl/Cmd+Enter to trigger search depending on mode
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        if (mode === 'people') runPeopleSearch()
        else runCompanySearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  // Render People search UI
  const renderPeople = () => (
    <div className="space-y-4">
      {/* Panel 1: People search */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setPeopleSearchOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3"
          aria-expanded={peopleSearchOpen}
        >
          <h3 className="font-semibold">Candidate | Contact Search</h3>
          <svg
            width="16" height="16" viewBox="0 0 20 20" fill="currentColor"
            className={peopleSearchOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
          >
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
          </svg>
        </button>
        {peopleSearchOpen && (
          <form onSubmit={runPeopleSearch} className="p-4 pt-0">
            {/* grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Titles */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Job Titles</label>
                <div className="rounded-xl border px-2 py-1.5">
                  <div className="flex flex-wrap gap-2">
                    {personTitles.chips.map(v => (
                      <Chip key={v} onRemove={() => personTitles.removeChip(v)}>{v}</Chip>
                    ))}
                    <input
                      className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                      placeholder="e.g. Field Service Technician"
                      value={personTitles.input}
                      onChange={e => personTitles.setInput(e.target.value)}
                      onKeyDown={personTitles.onKeyDown}
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
                    {personLocations.chips.map(v => (
                      <Chip key={v} onRemove={() => personLocations.removeChip(v)}>{v}</Chip>
                    ))}
                    <input
                      className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                      placeholder="e.g. California, United States"
                      value={personLocations.input}
                      onChange={e => personLocations.setInput(e.target.value)}
                      onKeyDown={personLocations.onKeyDown}
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
                    {personKeywords.chips.map(v => (
                      <Chip key={v} onRemove={() => personKeywords.removeChip(v)}>{v}</Chip>
                    ))}
                    <input
                      className="min-w-[10ch] flex-1 outline-none text-sm px-2 py-1"
                      placeholder="e.g. Fire, Security, CCTV"
                      value={personKeywords.input}
                      onChange={e => personKeywords.setInput(e.target.value)}
                      onKeyDown={personKeywords.onKeyDown}
                      disabled={isDown}
                    />
                  </div>
                </div>
              </div>
              {/* Seniorities */}
              <MultiSelect
                label="Seniorities"
                options={SENIORITIES as unknown as string[]}
                values={personSeniorities}
                setValues={setPersonSeniorities}
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
                disabled={isDown || peopleLoading}
              >
                {peopleLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
            {/* Advanced search: mailto link */}
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
      {/* Panel 2: People results */}
      <div className="rounded-2xl border bg-white shadow-sm">
        {peopleError ? (
          <div className="p-6 text-sm text-red-600">{peopleError}</div>
        ) : people.length === 0 && !peopleLoading ? (
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
                  {/* Row 1: Name | Location + icons */}
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
                  {/* Row 2: Title + Organization + toggle */}
                  <div className="mt-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm">{p.title || '—'}</div>
                      <div className="text-sm flex items-center gap-2">
                        <span className="truncate">{p.organization_name || '—'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePersonExpanded(p.id)}
                      className="text-sm text-gray-700 hover:text-gray-900 inline-flex items-center gap-1"
                      title="Toggle employment history"
                    >
                      Employment history
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className={peopleExpanded.has(p.id) ? 'rotate-180 transition-transform' : 'transition-transform'}>
                        <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
                      </svg>
                    </button>
                  </div>
                  {/* Collapsible: Employment history */}
                  {peopleExpanded.has(p.id) && (
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

  // Render Company results UI
const renderCompanies = () => (
  <>
    {companies.length > 0 ? (
      <ul className="divide-y divide-gray-200">
        {companies.map((c: Company) => (
          <li key={c.id} className="p-4">
            {/* Row 1: Company name | city, state + icons */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-base truncate">
                  {c.name || '—'}
                </span>
                {formatCityState(c) ? (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-xs text-gray-600 truncate">
                      {formatCityState(c)}
                    </span>
                  </>
                ) : null}
              </div>

              <div className="shrink-0 flex items-center gap-3">
                <a
                  href={c.linkedin_url || undefined}
                  target={c.linkedin_url ? '_blank' : undefined}
                  rel={c.linkedin_url ? 'noreferrer' : undefined}
                  className={c.linkedin_url ? '' : 'opacity-30 pointer-events-none cursor-default'}
                  title={c.linkedin_url ? 'Open LinkedIn' : 'LinkedIn not available'}
                >
                  <IconLinkedIn />
                </a>
                <a
                  href={c.website_url || undefined}
                  target={c.website_url ? '_blank' : undefined}
                  rel={c.website_url ? 'noreferrer' : undefined}
                  className={c.website_url ? 'text-gray-700 hover:text-gray-900' : 'opacity-30 pointer-events-none cursor-default'}
                  title={c.website_url ? 'Open company website' : 'Company website not available'}
                >
                  <IconGlobe muted={!c.website_url} />
                </a>
              </div>
            </div>

            {/* Row 2: short_description (left) + inline dropdowns (right) */}
            <div className="mt-1 flex items-start justify-between gap-4">
              <div className="text-sm text-gray-700 min-w-0">
                {c.short_description || '—'}
              </div>

              <div className="shrink-0 flex items-center gap-6 text-sm">
                <details className="inline-block group">
                  <summary className="list-none cursor-pointer text-gray-700 hover:text-gray-900 inline-flex items-center gap-1">
                    Job postings
                    <svg width="12" height="12" viewBox="0 0 20 20" className="text-gray-500 group-open:rotate-180 transition-transform">
                      <path fill="currentColor" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z"/>
                    </svg>
                  </summary>
                  <div className="mt-2 p-3 rounded-xl border bg-gray-50 min-w-[280px]">
                    {c.job_postings?.length ? (
                      <ul className="text-xs text-gray-700 space-y-1">
                        {c.job_postings.map((job: any) => (
                          <li key={job.id}>
                            <span className="font-medium">{job.title || 'Untitled job'}</span>
                            {job.location && <span className="text-gray-500"> — {job.location}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gray-500">No job postings.</div>
                    )}
                  </div>
                </details>

                <details className="inline-block group">
                  <summary className="list-none cursor-pointer text-gray-700 hover:text-gray-900 inline-flex items-center gap-1">
                    Hiring contacts
                    <svg width="12" height="12" viewBox="0 0 20 20" className="text-gray-500 group-open:rotate-180 transition-transform">
                      <path fill="currentColor" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z"/>
                    </svg>
                  </summary>
                  <div className="mt-2 p-3 rounded-xl border bg-gray-50 min-w-[280px]">
                    {c.hiring_people?.length ? (
                      <ul className="text-xs text-gray-700 space-y-1">
                        {c.hiring_people.map((p: any) => (
                          <li key={p.id}>
                            <span className="font-medium">{p.name || '—'}</span>
                            {p.title && <span className="text-gray-500"> — {p.title}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gray-500">No hiring contacts.</div>
                    )}
                  </div>
                </details>

                <details className="inline-block group">
                  <summary className="list-none cursor-pointer text-gray-700 hover:text-gray-900 inline-flex items-center gap-1">
                    News articles
                    <svg width="12" height="12" viewBox="0 0 20 20" className="text-gray-500 group-open:rotate-180 transition-transform">
                      <path fill="currentColor" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z"/>
                    </svg>
                  </summary>
                  <div className="mt-2 p-3 rounded-xl border bg-gray-50 min-w-[280px]">
                    {c.news_articles?.length ? (
                      <ul className="text-xs text-gray-700 space-y-1">
                        {c.news_articles.map((n: any) => (
                          <li key={n.id}>
                            <span className="font-medium">{n.title || '—'}</span>
                            {n.url && (
                              <a
                                className="text-orange-600 hover:underline ml-1"
                                href={n.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                (view)
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-gray-500">No news articles.</div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-gray-500 italic">No companies found.</p>
    )}
  </>
)
  return (
  <div className="space-y-4">
    {mode === 'people' ? renderPeople() : renderCompanies()}
  </div>
)
}


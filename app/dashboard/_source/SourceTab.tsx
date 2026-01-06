'use client'

import type React from 'react'
import { useEffect, useRef, useState } from 'react'

// Mode indicates which sourcing tab is currently active
type SourceMode = 'people' | 'companies'

/* =========================
   Shared Types
   ========================= */
type EmploymentItem = {
  organization_name: string | null
  title: string | null
  start_date: string | null
  end_date: string | null
  current?: boolean | null
}

type JobPosting = {
  id: string
  title: string | null
  location: string | null
  employment_type: string | null
  remote: boolean | null
  url: string | null
  posted_at?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
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

type NewsArticle = {
  id: string
  title: string | null
  description: string | null
  published_at: string | null
  url: string | null
  event_categories?: string[] | null
}

type Company = {
  id: string
  org_id: string
  name: string | null
  website_url: string | null
  linkedin_url: string | null
  exact_location?: string | null
  city?: string | null
  state?: string | null
  short_description?: string | null
  job_postings?: JobPosting[]
  hiring_people?: Person[]
  news_articles?: NewsArticle[]
}

type HiringPerson = Person

function formatCityState(c: Company) {
  const city = (c.city || '').trim()
  const state = (c.state || '').trim()
  if (city && state) return `${city}, ${state}`
  return city || state || null
}

/* =========================
   Constants / Helpers
   ========================= */
const SENIORITIES = [
  'Owner',
  'Founder',
  'C_Suite',
  'Partner',
  'VP',
  'Head',
  'Director',
  'Manager',
  'Senior',
  'Entry',
  'Intern',
] as const

const KEYWORD_SUGGESTIONS = [
  'Access Control',
  'CCTV',
  'CCTV Cameras',
  'CCTV Installation',
  'CCTV Integration',
  'CCTV Monitoring',
  'CCTV Security',
  'CCTV Solutions',
  'CCTV Surveillance',
  'CCTV Systems',
  'Data Center',
  'Fire Alarm Installation',
  'Fire Alarm Systems',
  'Fire Alarms',
  'Fire Code Compliance',
  'Fire Detection',
  'Fire Detection Systems',
  'Fire Doors',
  'Fire Extinguishers',
  'Fire Extinguishing Systems',
  'Fire Prevention',
  'Fire Prevention Strategies',
  'Fire Prevention Systems',
  'Fire Protection',
  'Fire Protection Solutions',
  'Fire Protection Systems',
  'Fire Rated Doors',
  'Fire Safety Management',
  'Fire Safety Solutions',
  'Fire Safety Systems',
  'Fire Sprinkler Systems',
  'Fire Suppression',
  'Fire Suppression Systems',
  'Intruder',
  'Intruder Alarms',
  'Security',
  'Security Alarms',
  'Security Analytics',
  'Security Assessments',
  'Security Audits',
  'Security Awareness Training',
  'Security Cameras',
  'Security Compliance',
  'Security Consulting',
  'Security Controls',
  'Security Doors',
  'Security Features',
  'Security Fencing',
  'Security Frameworks',
  'Security Gates',
  'Security Infrastructure',
  'Security Installation',
  'Security Integration',
  'Security Lighting',
  'Security Management',
  'Security Measures',
  'Security Monitoring',
  'Security Policies',
  'Security Products',
  'Security Professionals',
  'Security Protocols',
  'Security Services',
  'Security Software',
  'Security Solutions',
  'Security Surveillance',
  'Security System Installation',
  'Security Systems',
  'Security Systems Services',
  'Security Technologies',
  'Security Technology',
  'Security Tools',
  'Security Training',
] as const

function getKeywordSuggestions(query: string, existing: string[]): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  return KEYWORD_SUGGESTIONS
    .map(k => k as string)
    // Don’t suggest something that’s already a chip
    .filter(k => !existing.includes(k))
    // Simple contains match – “cc” will match “CCTV…”
    .filter(k => k.toLowerCase().includes(q))
    // Only show first 10
    .slice(0, 10)
}

const phIfEmpty = (value: string, chips: string[] | undefined, text: string) =>
  (value?.trim() || (chips && chips.length)) ? '' : text

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

function Chip({ children, onRemove }: { children: string; onRemove: (e?: React.MouseEvent) => void }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-2 h-7 rounded-full bg-gray-100 px-3 text-sm">
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
function IconGlobe({ muted }: { muted?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={muted ? 'text-gray-300' : 'text-gray-700'}>
      <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm7.93 9h-3.086a15.4 15.4 0 0 0-1.02-5.02A8.01 8.01 0 0 1 19.93 11ZM12 4c.94 1.24 1.66 3.12 1.98 5H10.02C10.34 7.12 11.06 5.24 12 4ZM8.176 6.98A15.4 15.4 0 0 0 7.156 12H4.07a8.01 8.01 0 0 1 4.106-5.02ZM4.07 13h3.086a15.4 15.4 0 0 0 1.02 5.02A8.01 8.01 0 0 1 4.07 13ZM12 20c-.94-1.24-1.66-3.12-1.98-5h3.96C13.66 16.88 12.94 18.76 12 20Zm3.824-1.98A15.4 15.4 0 0 0 16.844 13h3.086a8.01 8.01 0 0 1-4.106 5.02ZM16.844 12a13.5 13.5 0 0 1-1.047-4H8.203a13.5 13.5 0 0 1-1.047 4h9.688Z"/>
    </svg>
  )
}

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

  function removeChip(opt: string) {
    setValues(values.filter(v => v !== opt))
  }

  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <div ref={ref} className="relative rounded-xl border h-10 px-3">
        <button
          type="button"
          className="w-full h-full text-left flex items-center justify-between"
          onClick={() => setOpen(o => !o)}
          title={values.length ? `${values.length} selected` : undefined}
        >
          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto mr-2">
            {values.length ? (
              values.map(v => (
                <span key={v} className="shrink-0">
                  <Chip onRemove={(e) => { e?.stopPropagation(); removeChip(v) }}>{v}</Chip>
                </span>
              ))
            ) : (
              <span className="text-sm text-gray-400">{placeholder}</span>
            )}
          </div>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className={open ? 'rotate-180 transition-transform' : 'transition-transform'}>
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-10 mt-1 w-full bg-white border rounded-xl shadow-sm max-h-60 overflow-y-auto text-sm">
            {options.map(opt => (
              <label
                key={opt}
                className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={values.includes(opt)}
                  onChange={() => toggleOpt(opt)}
                  className="appearance-none h-4 w-4 rounded border border-gray-300 grid place-content-center
                             checked:bg-[#F7941D]
                             before:content-[''] before:hidden checked:before:block
                             before:w-2.5 before:h-2.5
                             before:[clip-path:polygon(14%_44%,0_59%,39%_100%,100%_18%,84%_4%,39%_72%)]
                             before:bg-white"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function makeStaticNote(firstName?: string | null) {
  const first = (firstName || '').trim() || 'there'
  return `Hi ${first}, it's always nice to meet others passionate about the industry. Would be great to connect.`
}

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
  employment_history.sort((a, b) => {
    if (a.current && !b.current) return -1
    if (b.current && !a.current) return 1
    const aKey = (a.end_date || a.start_date || '').toString()
    const bKey = (b.end_date || b.start_date || '').toString()
    return bKey.localeCompare(aKey)
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

/* =========================
   Main Component
   ========================= */
export default function SourceTab({ mode }: { mode: SourceMode }) {
  const isDown =
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === '1' ||
    (process.env.NEXT_PUBLIC_SOURCING_DOWN || '').toLowerCase() === 'true'

  /* ----- People search state ----- */
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

  const companyMailToSubject = 'Advanced Search Request (companies)'
  const companyMailToBody = `Hi BTS Team,

Please can I request an advanced search with the criteria listed below, thank you.

Company Lookalikes: (Provide full company names)

Locations:

Company Keywords:
  - Exclude:

Number of Employees Range:

Job Postings: 
  - Date Range:
  - Job Titles: 
  - Locations:

Kind regards,`
  const companySubjectEncoded = encodeURIComponent(companyMailToSubject)
  const companyBodyEncoded = encodeURIComponent(companyMailToBody)
   
  function togglePersonExpanded(id: string) {
    setPeopleExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onLinkedInClick = async (e: React.MouseEvent, url?: string, id?: string) => {
    if (!url) return
    e.preventDefault()
    const note = id ? notesById[id] : ''
    if (note) {
      try {
        await navigator.clipboard.writeText(note)
        setCopiedId(id || null)
        setTimeout(() => setCopiedId(null), 1200)
      } catch {}
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

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
      const built: Record<string, string> = {}
      for (const p of mapped) {
        const firstName = (p.name || '').split(' ')?.[0] || ''
        built[p.id] = makeStaticNote(firstName)
      }
      setNotesById(built)
      try {
        await fetch('/api/notes/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: Object.entries(built).map(([candidateId, note]) => ({ candidateId, note })) }),
        })
      } catch {}
    } catch (err: any) {
      setPeopleError(err?.message || 'Unexpected error')
    } finally {
      setPeopleSearchOpen(false)
      setPeopleLoading(false)
    }
  }

  /* ----- Company search state ----- */
  const companyLocations = useChipInput([])
  const companyKeywords = useChipInput([])
  const [activeJobsOnly, setActiveJobsOnly] = useState(false)
  const activeJobsDays = useChipInput([])
  const activeJobTitles = useChipInput([])
  const employeesMin = useChipInput([])
  const employeesMax = useChipInput([])

  const [companyLoading, setCompanyLoading] = useState(false)
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [companySearchOpen, setCompanySearchOpen] = useState(true)
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
      // Use last "Days" chip if numeric
      const daysChip = activeJobsDays.chips.length
        ? activeJobsDays.chips[activeJobsDays.chips.length - 1]
        : null
      const daysNum = daysChip && /^\d+$/.test(daysChip) ? Number(daysChip) : null

      const payload = {
        locations: companyLocations.chips,
        keywords: companyKeywords.chips,
        employeesMin: employeesMin.chips[0] ? Number(employeesMin.chips[0]) : null,
        employeesMax: employeesMax.chips[0] ? Number(employeesMax.chips[0]) : null,
        activeJobsOnly,
        activeJobsDays: activeJobsOnly ? daysNum : null,
        ...(activeJobsOnly && activeJobTitles.chips.length ? { jobTitles: activeJobTitles.chips } : {}),
        page: 1,
        per_page: 25,
        debug: true,
      }

      const res = await fetch('/api/apollo/company-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-debug-apollo': '1',
        },
        body: JSON.stringify(payload),
      })

      const json: any = await res.json()

      if (!res.ok) {
        throw new Error(json?.error || `Search failed (${res.status})`)
      }

      const arr: any[] = Array.isArray(json.companies) ? json.companies : []

      const mapped: Company[] = arr.map((c: any) => ({
        id: (c?.id ?? c?.organization_id ?? '').toString(),
        org_id: (c?.org_id ?? c?.organization_id ?? c?.id ?? '').toString(),
        name: c?.name ?? c?.company_name ?? null,
        website_url: c?.website_url ?? c?.domain ?? null,
        linkedin_url: c?.linkedin_url ?? null,
        exact_location: c?.formatted_address ?? c?.location ?? null,
        city: c?.city ?? null,
        state: c?.state ?? null,
        short_description: c?.short_description ?? null,
        job_postings: [],
        hiring_people: [],
        news_articles: [],
      }))

      setCompanies(mapped)

      const orgIds = mapped.map(c => c.org_id).filter(Boolean)

      if (orgIds.length) {
        const [jpRes, newsRes, hiringRes] = await Promise.all([
          fetch('/api/apollo/job-postings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ org_ids: orgIds, per_page: 10 }),
          }),
          fetch('/api/apollo/news-articles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ org_ids: orgIds, per_page: 2 }),
          }),
          fetch('/api/apollo/hiring-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ org_ids: orgIds, per_page: 3 }),
          }),
        ])

        const [jpJson, newsJson, hiringJson]: any[] = await Promise.all([
          jpRes.json(),
          newsRes.json(),
          hiringRes.json(),
        ])

        // ----- Job postings -----
        if (jpRes.ok) {
          let postingsByOrg: Record<string, any[]> = jpJson?.postingsByOrg || {}

          // Fallback: server returned a flat array (Apollo-style)
          if (
            (!postingsByOrg || !Object.keys(postingsByOrg).length) &&
            Array.isArray(jpJson?.organization_job_postings)
          ) {
            const grouped: Record<string, any[]> = {}
            for (const j of jpJson.organization_job_postings) {
              const key = (j.org_id || j.organization_id || j._organization_id || '').toString().trim()
              if (!key) continue
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(j)
            }
            postingsByOrg = grouped
          }

          setCompanies(prev =>
            prev.map(c => ({
              ...c,
              job_postings: postingsByOrg[c.org_id] ?? [],
            })),
          )
        }

        // ----- News articles -----
        if (newsRes.ok) {
          let articlesByOrg: Record<string, any[]> = newsJson?.articlesByOrg || {}

          // Fallback: raw array only
          if (
            (!articlesByOrg || !Object.keys(articlesByOrg).length) &&
            (Array.isArray(newsJson?.apollo?.news_articles) ||
              Array.isArray(newsJson?.news_articles) ||
              Array.isArray(newsJson?.articles))
          ) {
            const raw: any[] =
              (Array.isArray(newsJson?.apollo?.news_articles) && newsJson.apollo.news_articles) ||
              (Array.isArray(newsJson?.news_articles) && newsJson.news_articles) ||
              (Array.isArray(newsJson?.articles) && newsJson.articles) ||
              []
            const grouped: Record<string, any[]> = {}
            for (const a of raw) {
              const key = (a.organization_id || a.org_id || a.account_id || '').toString().trim()
              if (!key) continue
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(a)
            }
            articlesByOrg = grouped
          }

          setCompanies(prev =>
            prev.map(c => ({
              ...c,
              news_articles: (articlesByOrg[c.org_id] ?? []).map((a: any) => ({
                id: (a.id ?? a.article_id ?? '').toString(),
                title: a.title ?? null,
                description: a.description ?? a.summary ?? null,
                published_at: a.published_at ?? a.published_date ?? null,
                url: a.url ?? a.article_url ?? null,
                event_categories: Array.isArray(a.event_categories)
                  ? a.event_categories
                  : typeof a.event_categories === 'string'
                  ? [a.event_categories]
                  : null,
              })),
            })),
          )
        }

        // ----- Hiring contacts via mixed_people -----
        if (hiringRes.ok) {
          let hiringByOrg: Record<string, any[]> = hiringJson?.hiringByOrg || {}

          // Fallback: if the route ever just relays raw Apollo data
          if (
            (!hiringByOrg || !Object.keys(hiringByOrg).length) &&
            (Array.isArray(hiringJson?.people) || Array.isArray(hiringJson?.contacts))
          ) {
            const raw: any[] =
              (Array.isArray(hiringJson?.people) && hiringJson.people) ||
              (Array.isArray(hiringJson?.contacts) && hiringJson.contacts) ||
              []
            const grouped: Record<string, any[]> = {}
            for (const p of raw) {
              const key =
                (p.organization_id ??
                  p.org_id ??
                  p.account_id ??
                  p.organization?.id ??
                  ''
                ).toString().trim()
              if (!key) continue
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(p)
            }
            hiringByOrg = grouped
          }

          setCompanies(prev =>
            prev.map(c => ({
              ...c,
              hiring_people: (hiringByOrg[c.org_id] ?? []).map((p: any) => transformToPerson(p)),
            })),
          )
        }
      }
    } catch (err: any) {
      setCompanyError(err?.message || 'Unexpected error')
    } finally {
      setCompanySearchOpen(false)
      setCompanyLoading(false)
    }
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        if (mode === 'people') runPeopleSearch()
        else runCompanySearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const renderPeople = () => {
    return (
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
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={peopleSearchOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            >
              <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
            </svg>
          </button>
          {peopleSearchOpen && (
            <form onSubmit={runPeopleSearch} className="p-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Job Titles</label>
                  <div className="rounded-xl border h-10 px-2">
                    <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                      {personTitles.chips.map(v => (
                        <Chip key={v} onRemove={() => personTitles.removeChip(v)}>
                          {v}
                        </Chip>
                      ))}
                      <input
                        className="flex-1 min-w-0 outline-none text-sm h-8 px-2"
                        placeholder={phIfEmpty(personTitles.input, personTitles.chips, 'e.g. Field Service Technician')}
                        value={personTitles.input}
                        onChange={e => personTitles.setInput(e.target.value)}
                        onKeyDown={personTitles.onKeyDown}
                        disabled={isDown}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Locations</label>
                  <div className="rounded-xl border h-10 px-2">
                    <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                      {personLocations.chips.map(v => (
                        <Chip key={v} onRemove={() => personLocations.removeChip(v)}>
                          {v}
                        </Chip>
                      ))}
                      <input
                        className="flex-1 min-w-0 outline-none text-sm h-8 px-2"
                        placeholder={phIfEmpty(personLocations.input, personLocations.chips, 'e.g. California, United States')}
                        value={personLocations.input}
                        onChange={e => personLocations.setInput(e.target.value)}
                        onKeyDown={personLocations.onKeyDown}
                        disabled={isDown}
                      />
                    </div>
                  </div>
                </div>
                <div>
                 <label className="block text-sm text-gray-600 mb-1 flex items-center gap-1">
                   Keywords
                   <span
                     className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-gray-300 text-[10px] leading-none text-gray-500 cursor-default"
                     title={`Please be broader with your keywords.
                                 Keywords such as 'Lenel' or 'C-Cure' will fall under 'Security Systems'.`}
                   >
                     i
                   </span>
                 </label>
                 <div className="rounded-xl border h-10 px-2 relative">
                   <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                     {personKeywords.chips.map(v => (
                       <Chip key={v} onRemove={() => personKeywords.removeChip(v)}>
                         {v}
                       </Chip>
                     ))}
                     <input
                       className="flex-1 min-w-0 outline-none text-sm h-8 px-2"
                       placeholder={phIfEmpty(
                         personKeywords.input,
                         personKeywords.chips,
                         'e.g. Fire, Security, CCTV',
                       )}
                       value={personKeywords.input}
                       onChange={e => personKeywords.setInput(e.target.value)}
                       onKeyDown={personKeywords.onKeyDown}
                       disabled={isDown}
                     />
                   </div>
               
                   {/* Keyword suggestions dropdown */}
                   {(() => {
                     const suggestions = getKeywordSuggestions(
                       personKeywords.input,
                       personKeywords.chips,
                     )
                     if (!suggestions.length) return null
               
                     return (
                       <ul
                         className="absolute left-0 right-0 mt-1 top-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto text-sm z-20"
                       >
                         {suggestions.map(option => (
                           <li
                             key={option}
                             className="px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                             // onMouseDown so we don't lose focus before updating state
                             onMouseDown={e => {
                               e.preventDefault()
                               personKeywords.setChips(prev =>
                                 prev.includes(option) ? prev : [...prev, option],
                               )
                               personKeywords.setInput('')
                             }}
                           >
                             {option}
                           </li>
                         ))}
                       </ul>
                     )
                   })()}
                 </div>
               </div>
                <MultiSelect
                  label="Seniorities"
                  options={SENIORITIES as unknown as string[]}
                  values={personSeniorities}
                  setValues={setPersonSeniorities}
                  placeholder="Choose one or more seniorities"
                />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Please press <kbd className="px-1 border rounded">Enter</kbd> to submit each chip.
                </span>
                <button
                  type="submit"
                  className="rounded-full bg-[#F7941D] text-white px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  disabled={isDown || peopleLoading}
                >
                  {peopleLoading ? 'Searching…' : 'Search'}
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <div className="text-right text-xs text-gray-500">
                  If you would like to request a more advanced people search, please click{' '}
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
                        <a
                          href={hasLI ? p.linkedin_url! : undefined}
                          onClick={hasLI ? (ev) => onLinkedInClick(ev, p.linkedin_url!, p.id) : undefined}
                          className={hasLI ? '' : 'opacity-30 pointer-events-none cursor-default'}
                          title={
                            hasLI ? (copiedId === p.id ? 'Note copied!' : 'Open LinkedIn (note copies first)') : 'LinkedIn not available'
                          }
                        >
                          <IconLinkedIn />
                        </a>
                        <a
                          href={hasFB ? p.facebook_url! : undefined}
                          target={hasFB ? '_blank' : undefined}
                          rel={hasFB ? 'noreferrer' : undefined}
                          className={hasFB ? '' : 'opacity-30 pointer-events-none cursor-default'}
                          title={hasFB ? 'Open Facebook' : 'Facebook not available'}
                        >
                          <IconFacebook />
                        </a>
                        <a
                          href={hasWWW ? p.organization_website_url! : undefined}
                          target={hasWWW ? '_blank' : undefined}
                          rel={hasWWW ? 'noreferrer' : undefined}
                          className={hasWWW ? 'text-gray-700 hover:text-gray-900' : 'opacity-30 pointer-events-none cursor-default'}
                          title={hasWWW ? 'Open company website' : 'Company website not available'}
                        >
                          <IconGlobe muted={!hasWWW} />
                        </a>
                      </div>
                    </div>
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
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={peopleExpanded.has(p.id) ? 'rotate-180 transition-transform' : 'transition-transform'}
                        >
                          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
                        </svg>
                      </button>
                    </div>
                    {peopleExpanded.has(p.id) && (
                      <div className="mt-3 rounded-xl border bg-gray-50">
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

    const renderCompanies = () => {
    return (
      <div className="space-y-4">
        {/* Panel 1: Company search */}
        <div className="rounded-2xl border bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setCompanySearchOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3"
            aria-expanded={companySearchOpen}
          >
            <h3 className="font-semibold">Company | Organization Search</h3>
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={companySearchOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            >
              <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
            </svg>
          </button>

          {companySearchOpen && (
            <form onSubmit={runCompanySearch} className="p-4 pt-0">
              {/* Row 1: Locations / Keywords */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Locations</label>
                  <div className="rounded-xl border h-10 px-2">
                    <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                      {companyLocations.chips.map((v) => (
                        <Chip key={v} onRemove={() => companyLocations.removeChip(v)}>
                          {v}
                        </Chip>
                      ))}
                      <input
                        className="flex-1 min-w-0 outline-none text-sm h-8 px-2"
                        placeholder={phIfEmpty(
                          companyLocations.input,
                          companyLocations.chips,
                          'e.g. London, United Kingdom',
                        )}
                        value={companyLocations.input}
                        onChange={(e) => companyLocations.setInput(e.target.value)}
                        onKeyDown={companyLocations.onKeyDown}
                        disabled={isDown}
                      />
                    </div>
                  </div>
                </div>

                <div>
                 <label className="block text-sm text-gray-600 mb-1 flex items-center gap-1">
                   Keywords
                   <span
                     className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-gray-300 text-[10px] leading-none text-gray-500 cursor-default"
                     title={`Please be broader with your keywords.
                                 Keywords such as 'Lenel' or 'C-Cure' will fall under 'Security Systems'.`}
                   >
                     i
                   </span>
                 </label>
                 <div className="rounded-xl border h-10 px-2 relative">
                   <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                     {companyKeywords.chips.map(v => (
                       <Chip key={v} onRemove={() => companyKeywords.removeChip(v)}>
                         {v}
                       </Chip>
                     ))}
                     <input
                       className="flex-1 min-w-0 outline-none text-sm h-8 px-2"
                       placeholder={phIfEmpty(
                         companyKeywords.input,
                         companyKeywords.chips,
                         'e.g. Fire, Security, CCTV',
                       )}
                       value={companyKeywords.input}
                       onChange={e => companyKeywords.setInput(e.target.value)}
                       onKeyDown={companyKeywords.onKeyDown}
                       disabled={isDown}
                     />
                   </div>
               
                   {/* Keyword suggestions dropdown */}
                   {(() => {
                     const suggestions = getKeywordSuggestions(
                       companyKeywords.input,
                       companyKeywords.chips,
                     )
                     if (!suggestions.length) return null
               
                     return (
                       <ul
                         className="absolute left-0 right-0 mt-1 top-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto text-sm z-20"
                       >
                         {suggestions.map(option => (
                           <li
                             key={option}
                             className="px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                             onMouseDown={e => {
                               e.preventDefault()
                               companyKeywords.setChips(prev =>
                                 prev.includes(option) ? prev : [...prev, option],
                               )
                               companyKeywords.setInput('')
                             }}
                           >
                             {option}
                           </li>
                         ))}
                       </ul>
                     )
                   })()}
                 </div>
               </div>
              </div>

              {/* Row 2: Employees | Active Job Listings */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Employees */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Employees <span className="text-xs text-gray-400">(from &amp; to)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="rounded-xl border h-10 px-2 flex-1 basis-0 min-w-0">
                      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                        {employeesMin.chips?.map((v: string) => (
                          <Chip key={v} onRemove={() => employeesMin.removeChip(v)}>
                            {v}
                          </Chip>
                        ))}
                        <input
                          className="min-w-[5rem] grow outline-none text-sm h-8 px-2"
                          placeholder={phIfEmpty(
                            employeesMin.input,
                            employeesMin.chips,
                            'From (e.g. 50)',
                          )}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={employeesMin.input}
                          onChange={(e) => employeesMin.setInput(e.target.value.replace(/\D+/g, ''))}
                          onKeyDown={employeesMin.onKeyDown}
                          disabled={isDown}
                        />
                      </div>
                    </div>

                    <span className="text-gray-400 text-sm">to</span>

                    <div className="rounded-xl border h-10 px-2 flex-1 basis-0 min-w-0">
                      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                        {employeesMax.chips?.map((v: string) => (
                          <Chip key={v} onRemove={() => employeesMax.removeChip(v)}>
                            {v}
                          </Chip>
                        ))}
                        <input
                          className="min-w-[5rem] grow outline-none text-sm h-8 px-2"
                          placeholder={phIfEmpty(
                            employeesMax.input,
                            employeesMax.chips,
                            'To (e.g. 250)',
                          )}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={employeesMax.input}
                          onChange={(e) => employeesMax.setInput(e.target.value.replace(/\D+/g, ''))}
                          onKeyDown={employeesMax.onKeyDown}
                          disabled={isDown}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Active Job Listings */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1 flex items-center gap-2">
                    <input
                      id="activeJobsOnly"
                      type="checkbox"
                      className="appearance-none h-4 w-4 rounded border border-gray-300 grid place-content-center
                                 checked:bg-[#F7941D]
                                 before:content-[''] before:hidden checked:before:block
                                 before:w-2.5 before:h-2.5
                                 before:[clip-path:polygon(14%_44%,0_59%,39%_100%,100%_18%,84%_4%,39%_72%)]
                                 before:bg-white"
                      checked={activeJobsOnly}
                      onChange={(e) => setActiveJobsOnly(e.target.checked)}
                      disabled={isDown}
                    />
                    Active Job Listings
                  </label>

                  <div
                    className={`flex items-center gap-3 ${
                      !activeJobsOnly || isDown ? 'opacity-50' : ''
                    }`}
                    aria-disabled={!activeJobsOnly || isDown}
                  >
                    <div className="shrink-0 rounded-xl border h-10 px-2 w-36">
                      <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
                        {activeJobsDays.chips.map((v) => (
                          <Chip key={v} onRemove={() => activeJobsDays.removeChip(v)}>
                            {v}
                          </Chip>
                        ))}
                        <input
                          className="min-w-[8rem] grow outline-none text-sm h-8 px-2"
                          placeholder={phIfEmpty(
                            activeJobsDays.input,
                            activeJobsDays.chips,
                            'Days (e.g. 30)',
                          )}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={activeJobsDays.input}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D+/g, '')
                            activeJobsDays.setInput(digits)
                          }}
                          onKeyDown={activeJobsDays.onKeyDown}
                          disabled={!activeJobsOnly || isDown}
                        />
                      </div>
                    </div>

                    <div className="flex-1 basis-0 min-w-0 rounded-xl border h-10 px-2">
                      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
                        {activeJobTitles.chips.map((v) => (
                          <Chip key={v} onRemove={() => activeJobTitles.removeChip(v)}>
                            {v}
                          </Chip>
                        ))}
                        <input
                          className="flex-1 min-w-0 outline-none text-sm h-8 px-2"
                          placeholder={phIfEmpty(
                            activeJobTitles.input,
                            activeJobTitles.chips,
                            'Job Titles (e.g. Engineer, Manager)',
                          )}
                          value={activeJobTitles.input}
                          onChange={(e) => activeJobTitles.setInput(e.target.value)}
                          onKeyDown={activeJobTitles.onKeyDown}
                          disabled={!activeJobsOnly || isDown}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tips + Search button */}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Please press <kbd className="px-1 border rounded">Enter</kbd> to submit each chip.
                </span>
                <button
                  type="submit"
                  className="rounded-full bg-[#F7941D] text-white px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  disabled={isDown || companyLoading}
                >
                  {companyLoading ? 'Searching…' : 'Search'}
                </button>
              </div>

              {companyError && <div className="mt-3 text-sm text-red-600">{companyError}</div>}

               <div className="mt-3 flex justify-end">
                <div className="text-right text-xs text-gray-500">
                  If you would like to request a more advanced company search, please click{' '}
                  <a
                    href={`mailto:bts@zitko.co.uk?subject=${companySubjectEncoded}&body=${companyBodyEncoded}`}
                    className="text-orange-500 hover:text-orange-600 no-underline"
                  >
                    here
                  </a>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Panel 2: Company results */}
        <div className="rounded-2xl border bg-white shadow-sm">
          {companies.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {companies.map((c: Company) => {
                const hasHiringContacts = (c.hiring_people?.length ?? 0) > 0
                const hasActiveJobs = (c.job_postings?.length ?? 0) > 0
                const showAlertIcon = hasActiveJobs && !hasHiringContacts

                return (
                  <li key={c.id} className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Info icon: orange glow when jobs exist but no hiring contacts */}
                        <span
                          className={
                            'inline-flex items-center justify-center h-5 w-5 rounded-full border text-[10px] font-semibold ' +
                            (showAlertIcon
                              ? 'border-[#F7941D] text-[#F7941D] bg-orange-50 shadow-[0_0_6px_rgba(247,148,29,0.85)]'
                              : 'border-gray-300 text-gray-300 bg-white')
                          }
                          title={
                            showAlertIcon
                              ? 'Search results for this company have identified active job postings with potentially no internal hiring contacts to support with them.'
                              : ''
                          }
                        >
                          i
                        </span>

                        <span className="font-semibold text-base truncate">{c.name || '—'}</span>
                        {(c.exact_location || formatCityState(c)) ? (
                          <>
                            <span className="text-gray-300">|</span>
                            <span className="text-xs text-gray-600 truncate">
                              {c.exact_location || formatCityState(c)}
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
                          className={
                            c.website_url
                              ? 'text-gray-700 hover:text-gray-900'
                              : 'opacity-30 pointer-events-none cursor-default'
                          }
                          title={c.website_url ? 'Open company website' : 'Company website not available'}
                        >
                          <IconGlobe muted={!c.website_url} />
                        </a>
                      </div>
                    </div>

                    <div className="mt-2 flex items-start justify-between">
                      <div />
                      <div className="shrink-0 flex items-center gap-6 text-sm">
                        <button
                          type="button"
                          onClick={() => toggleJobPostings(c.id)}
                          className={
                            'inline-flex items-center gap-1 ' +
                            (expandedJobs.has(c.id)
                              ? 'text-[#F7941D]'
                              : 'text-gray-700 hover:text-gray-900')
                          }
                        >
                          Job postings
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 20 20"
                            className={
                              expandedJobs.has(c.id)
                                ? 'rotate-180 transition-transform'
                                : 'transition-transform'
                            }
                          >
                            <path
                              fill="currentColor"
                              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z"
                            />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleHiringPeople(c.id)}
                          className={
                            'inline-flex items-center gap-1 ' +
                            (expandedHiring.has(c.id)
                              ? 'text-[#F7941D]'
                              : 'text-gray-700 hover:text-gray-900')
                          }
                        >
                          Hiring contacts
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 20 20"
                            className={
                              expandedHiring.has(c.id)
                                ? 'rotate-180 transition-transform'
                                : 'transition-transform'
                            }
                          >
                            <path
                              fill="currentColor"
                              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z"
                            />
                          </svg>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleNewsArticles(c.id)}
                          className={
                            'inline-flex items-center gap-1 ' +
                            (expandedNews.has(c.id)
                              ? 'text-[#F7941D]'
                              : 'text-gray-700 hover:text-gray-900')
                          }
                        >
                          News articles
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 20 20"
                            className={
                              expandedNews.has(c.id)
                                ? 'rotate-180 transition-transform'
                                : 'transition-transform'
                            }
                          >
                            <path
                              fill="currentColor"
                              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Job postings */}
                    {expandedJobs.has(c.id) && (
                      <div className="mt-3 rounded-xl border bg-gray-50 overflow-hidden">
                        <div className="px-3 py-2 border-b text-xs text-gray-500 grid grid-cols-12">
                          <div className="col-span-6">Title</div>
                          <div className="col-span-3">Location</div>
                          <div className="col-span-2 text-right">Posted</div>
                          <div className="col-span-1 text-right">Link</div>
                        </div>
                        <div className="max-h-60 overflow-auto">
                          <ul className="text-xs">
                            {c.job_postings?.length ? (
                              [...c.job_postings]
                                .sort((a: any, b: any) => {
                                  const da = a?.posted_at ? new Date(a.posted_at).getTime() : 0
                                  const db = b?.posted_at ? new Date(b.posted_at).getTime() : 0
                                  return db - da
                                })
                                .map((j: JobPosting) => {
                                  const location =
                                    [j.city, j.state, j.country].filter(Boolean).join(', ') || '—'

                                  return (
                                    <li
                                      key={j.id}
                                      className="px-3 py-2 border-t first:border-t-0 grid grid-cols-12 items-center"
                                    >
                                      <div className="col-span-6 truncate">
                                        {j.title || 'Untitled job'}
                                      </div>
                                      <div className="col-span-3 truncate">{location}</div>
                                      <div className="col-span-2 text-right">
                                        {j.posted_at
                                          ? new Date(j.posted_at).toLocaleDateString()
                                          : '—'}
                                      </div>
                                      <div className="col-span-1 text-right">
                                        {j.url ? (
                                          <a
                                            href={j.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-orange-600 hover:underline"
                                          >
                                            view
                                          </a>
                                        ) : (
                                          '—'
                                        )}
                                      </div>
                                    </li>
                                  )
                                })
                            ) : (
                              <li className="px-3 py-2 text-xs text-gray-500">
                                No job postings.
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Hiring contacts */}
                    {expandedHiring.has(c.id) && (
                      <div className="mt-3 rounded-xl border bg-gray-50 overflow-hidden">
                        <div className="px-3 py-2 border-b text-xs text-gray-500 grid grid-cols-12">
                          <div className="col-span-5">Name</div>
                          <div className="col-span-5">Title</div>
                          <div className="col-span-2 text-right">LinkedIn</div>
                        </div>
                        <ul className="text-xs">
                          {c.hiring_people?.length ? (
                            c.hiring_people.map((p: HiringPerson) => (
                              <li
                                key={p.id}
                                className="px-3 py-2 border-t first:border-t-0 grid grid-cols-12"
                              >
                                <div className="col-span-5 truncate">{p.name || '—'}</div>
                                <div className="col-span-5 truncate">{p.title || '—'}</div>
                                <div className="col-span-2 text-right">
                                  {p.linkedin_url ? (
                                    <a
                                      className="text-orange-600 hover:underline"
                                      href={p.linkedin_url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      view
                                    </a>
                                  ) : (
                                    '—'
                                  )}
                                </div>
                              </li>
                            ))
                          ) : (
                            <li className="px-3 py-2 text-xs text-gray-500">
                              No hiring contacts.
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* News articles */}
                    {expandedNews.has(c.id) && (
                      <div className="mt-3 rounded-xl border bg-gray-50 overflow-hidden">
                        <div className="px-3 py-2 border-b text-xs text-gray-500 grid grid-cols-12">
                          <div className="col-span-6">Title</div>
                          <div className="col-span-3">Category</div>
                          <div className="col-span-2">Published</div>
                          <div className="col-span-1 text-right">Link</div>
                        </div>
                        <ul className="text-xs">
                          {c.news_articles?.length ? (
                            c.news_articles.map((n: NewsArticle) => (
                              <li
                                key={n.id}
                                className="px-3 py-2 border-t first:border-t-0 grid grid-cols-12"
                              >
                                <div className="col-span-6 truncate">{n.title || '—'}</div>
                                <div className="col-span-3 truncate">
                                  {n.event_categories && n.event_categories.length
                                    ? n.event_categories.join(', ')
                                    : '—'}
                                </div>
                                <div className="col-span-2 truncate">
                                  {n.published_at
                                    ? new Date(n.published_at).toLocaleDateString()
                                    : '—'}
                                </div>
                                <div className="col-span-1 text-right">
                                  {n.url ? (
                                    <a
                                      className="text-orange-600 hover:underline"
                                      href={n.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      view
                                    </a>
                                  ) : (
                                    '—'
                                  )}
                                </div>
                              </li>
                            ))
                          ) : (
                            <li className="px-3 py-2 text-xs text-gray-500">
                              No news articles.
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="p-6 text-sm text-gray-500">No companies found.</p>
          )}
        </div>
      </div>
    )
  }

  return <div className="space-y-4">{mode === 'people' ? renderPeople() : renderCompanies()}</div>
}

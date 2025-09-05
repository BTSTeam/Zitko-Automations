// app/dashboard/page.tsx
// Updated dashboard/page.tsx with Page Size dropdown removed and KPIs section hidden
'use client'
import { useState, useEffect, type Dispatch, type SetStateAction, type ReactNode } from 'react'

type TabKey = 'match' | 'source' | 'cv'

type JobSummary = {
  id?: string
  job_title?: string
  location?: string
  skills?: string[]
  qualifications?: string[]
  public_description?: string
  internal_description?: string
  coords?: { lat: number, lng: number } | null
}

type CandidateRow = {
  id: string
  name: string
  title?: string
  location?: string
  linkedin?: string | null
  skills?: string[]
}

type ScoredRow = {
  candidateId: string
  candidateName: string
  score: number
  reason: string
  linkedin?: string
}

// --- helpers ---
function htmlToText(html?: string): string {
  if (!html) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return (doc.body?.textContent || '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

// NEW: normalize any location string to city-only
function extractCity(location?: string): string {
  if (!location) return ''
  let city = location.split(',')[0].trim() // take text before first comma
  city = city.replace(/\b(North|South|East|West|Northeast|Northwest|Southeast|Southwest)\b/gi, ' ').trim() // drop standalone directions
  city = city.replace(/\s{2,}/g, ' ').trim() // collapse double spaces
  return city
}

function KPIs() {
  return (
    <div className="grid sm:grid-cols-3 gap-4 mb-6">
      <div className="kpi"><h3>—</h3><p>Candidates Matched</p></div>
      <div className="kpi"><h3>—</h3><p>Candidates Sourced</p></div>
      <div className="kpi"><h3>—</h3><p>CVs Formatted</p></div>
    </div>
  )
}

function Tabs({
  tab,
  setTab
}: {
  tab: TabKey
  setTab: Dispatch<SetStateAction<TabKey>>
}) {
  const Item = ({ id, children }: { id: TabKey; children: ReactNode }) => (
    <button
      onClick={() => setTab(id)}
      className={`tab ${tab === id ? 'tab-active' : ''}`}
    >
      {children}
    </button>
  )
  return (
    <div className="flex gap-2 mb-6 justify-center">
      <Item id="match">Candidate Matching</Item>
      <Item id="source">Candidate Sourcing</Item>
      <Item id="cv">CV Formatting</Item>
    </div>
  )
}

function Table({
  rows, sortBy, setSortBy, filter, setFilter
}: {
  rows: ScoredRow[],
  sortBy: [keyof ScoredRow, 'asc'|'desc'],
  setSortBy: (s:[keyof ScoredRow,'asc'|'desc'])=>void,
  filter: string,
  setFilter: (v:string)=>void
}) {
  const sorted = [...rows].sort((a,b)=>{
    const [key, dir] = sortBy
    const va = a[key], vb = b[key]
    let cmp = 0
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''))
    return dir === 'asc' ? cmp : -cmp
  }).filter((r: ScoredRow) => JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()))
  const header = (key: keyof ScoredRow, label: string) => (
    <th className="cursor-pointer" onClick={()=> setSortBy([key, sortBy[0]===key && sortBy[1]==='asc'?'desc':'asc'])}>
      {label} {sortBy[0]===key ? (sortBy[1]==='asc'?'▲':'▼') : ''}
    </th>
  )
  return (
    <div className="card p-4">
      <div className="mb-3">
        <input className="input" placeholder="Filter..." value={filter} onChange={e=>setFilter(e.target.value)} />
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              {header('candidateId','Candidate ID')}
              {header('candidateName','Candidate Name')}
              <th>LinkedIn</th>
              {header('score','Suitability Score')}
              {header('reason','Reason')}
              <th>Vincere</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r=> (
              <tr key={r.candidateId} className="border-t">
                <td className="py-2">{r.candidateId}</td>
                <td>{r.candidateName}</td>
                <td>
                  {r.linkedin
                    ? <a className="text-brand-orange underline" href={r.linkedin} target="_blank" rel="noreferrer">Open</a>
                    : '—'}
                </td>
                <td>{r.score}</td>
                <td>{r.reason}</td>
                <td>
                  <a className="text-brand-orange underline" href={`https://zitko.vincere.io/app/candidate/${r.candidateId}`} target="_blank" rel="noreferrer">View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatchTab() {
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobSummary | null>(null)
  const [loadingJob, setLoadingJob] = useState(false)

  // extracted + editable fields (from OpenAI)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [qualsText, setQualsText] = useState('')

  // NEW: hold raw candidates (so UI shows results even if AI ranking is empty)
  const [rawCands, setRawCands] = useState<CandidateRow[]>([])

  const [scored, setScored] = useState<ScoredRow[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [sortBy, setSortBy] = useState<[keyof ScoredRow, 'asc'|'desc']>(['score','desc'])
  const [filter, setFilter] = useState('')

  // pagination (page size fixed to 20; dropdown removed)
  const [page] = useState(1)
  const pageSize = 20
  const [total, setTotal] = useState(0)

  // NEW: hide/show descriptions
  const [showDesc, setShowDesc] = useState(false)

  const retrieveJob = async () => {
    if (!jobId) return
    setLoadingJob(true)
    setScored([])
    setRawCands([])
    setTotal(0)

    try {
      const r = await fetch(`/api/vincere/position/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      const data = await r.json()

      const publicRaw = htmlToText(
        data?.public_description || data?.publicDescription || data?.description || ''
      )
      const internalRaw = htmlToText(
        data?.internal_description || data?.internalDescription || data?.job_description || data?.description_internal || ''
      )

      const extractResp = await fetch('/api/job/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicDescription: publicRaw,
          internalDescription: internalRaw
        })
      })
      const extracted = await extractResp.json()

      const skillsArr: string[] = Array.isArray(extracted?.skills) ? extracted.skills : []
      const qualsArr: string[] = Array.isArray(extracted?.qualifications) ? extracted.qualifications : []

      // normalize city-only location for UI + downstream search
      const cleanedLocation = extractCity(String(extracted?.location || '').trim())

      setJob({
        id: jobId,
        job_title: String(extracted?.title || '').trim(),
        location: cleanedLocation,
        skills: skillsArr,
        qualifications: qualsArr,
        public_description: publicRaw,
        internal_description: internalRaw,
        coords: null
      })

      setTitle(String(extracted?.title || '').trim())
      setLocation(cleanedLocation)
      setSkillsText(skillsArr.join(', '))
      setQualsText(qualsArr.join(', '))

    } catch (e) {
      console.error(e)
      alert('Failed to retrieve or extract job details.')
    } finally {
      setLoadingJob(false)
    }
  }

  // Run Vincere search, then AI ranking. Always show raw results immediately.
  const runSearch = async () => {
    if (!job) return
    setLoadingSearch(true)
    setScored([])
    setRawCands([])

    try {
      // 1) Vincere candidate search (by job title)
      const run = await fetch('/api/match/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: {
            title,
            location,
            skills: skillsText.split(',').map(s=>s.trim()).filter(Boolean),
            qualifications: qualsText.split(',').map(s=>s.trim()).filter(Boolean),
            description: job.public_description || ''
          },
          limit: 300,
          debug: true
        })
      })
      const payload = await run.json()
      console.log('MATCH/RUN payload:', payload)
      if (!run.ok) throw new Error(payload?.error || `Search failed (${run.status})`)

      const candidates = (payload?.results || []) as Array<{
        id: string
        firstName?: string
        lastName?: string
        fullName?: string
        location?: string
        city?: string
        title?: string
        skills?: string[]
        qualifications?: string[]
        linkedin?: string | null
      }>

      // Map raw candidates for immediate display
      const rawList: CandidateRow[] = candidates.map(c => ({
        id: String(c.id),
        name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
        title: c.title || '',
        location: c.location || c.city || '',
        linkedin: c.linkedin ?? null,
        skills: c.skills || []
      }))
      setRawCands(rawList)
      setTotal(rawList.length)

      // 2) AI scoring (priority: location, skills, qualifications, job title)
const ai = await fetch('/api/ai/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    job: {
      title,
      location,
      skills: skillsText.split(',').map(s => s.trim()).filter(Boolean),
      qualifications: qualsText.split(',').map(s => s.trim()).filter(Boolean),
      description: job.public_description || ''
    },
    candidates: candidates.map(c => ({
      candidate_id: c.id,
      full_name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      location: c.location || c.city || '',
      current_job_title: c.title || '',
      skills: c.skills || [],
      qualifications: c.qualifications || []
    })),
    // no "top 20" instruction; backend system prompt already says "score every candidate"
  })
})

const aiText = await ai.text()
// console.log('AI response:', aiText) // <- optional: uncomment to debug
let ranked: { ranked?: { candidate_id: string; score_percent: number; reason: string }[] } = {}
try { ranked = JSON.parse(aiText) } catch { ranked = {} }

// sort ALL returned candidates by score (desc)
const all = (ranked?.ranked || [])
  .map(r => ({
    candidate_id: String(r.candidate_id),
    score_percent: Number(r.score_percent) || 0,
    reason: String(r.reason || '')
  }))
  .sort((a, b) => b.score_percent - a.score_percent)

// 3) Map AI results to ScoredRow with LinkedIn + names
const byId = new Map(candidates.map(c => [String(c.id), c]))
const scoredRows: ScoredRow[] = all.map(r => {
  const c = byId.get(String(r.candidate_id))
  const candidateName =
    c?.fullName || `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || String(r.candidate_id)
  return {
    candidateId: String(r.candidate_id),
    candidateName,
    score: Math.round(r.score_percent),
    reason: r.reason,
    linkedin: c?.linkedin || undefined
  }
})

      if (scoredRows.length > 0) {
        setScored(scoredRows)
        setTotal(scoredRows.length)
      }
    } catch (e) {
      console.error(e)
      // Keep rawCands visible as fallback
      alert('Search or scoring hit an issue. Showing raw candidates (if any).')
    } finally {
      setLoadingSearch(false)
    }
  }

  const searchCandidates = async () => {
    if (!job) return alert('Retrieve Job Information first.')
    await runSearch()
  }

  const canPrev = false
  const canNext = false
  const showingFrom = (scored.length || rawCands.length) ? 1 : 0
  const showingTo = scored.length || rawCands.length || 0

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <p className="mb-4">Enter your Vincere Job ID to return the job details.</p>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-gray-600">Job ID</label>
            <input className="input mt-1" placeholder="Enter Job ID" value={jobId} onChange={e=>setJobId(e.target.value)} />
          </div>
        </div>
        {/* Adjusted from 3 to 2 columns and removed Page Size dropdown */}
        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <button className="btn btn-grey" onClick={retrieveJob} disabled={loadingJob}>
            {loadingJob ? 'Retrieving…' : 'Retrieve Job Information'}
          </button>
          <button className="btn btn-brand" onClick={searchCandidates} disabled={!job || loadingSearch}>
            {loadingSearch ? 'Searching…' : 'Search Candidates'}
          </button>
        </div>
      </div>

      {/* Split view: left = reviewed job info, right = candidates */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-semibold mb-3">Job Summary (review & edit)</h3>

          <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <div className="text-gray-500">Job Title</div>
              <input className="input mt-1" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g., Fire & Security Engineer" />
            </div>
            <div>
              <div className="text-gray-500">Location</div>
              <input className="input mt-1" value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g., London" />
            </div>
            <div className="sm:col-span-2">
              <div className="text-gray-500">Skills (comma-separated)</div>
              <input className="input mt-1" value={skillsText} onChange={e=>setSkillsText(e.target.value)} placeholder="CCTV, Access Control, IP Networking" />
            </div>
            <div className="sm:col-span-2">
              <div className="text-gray-500">Qualifications (comma-separated)</div>
              <input className="input mt-1" value={qualsText} onChange={e=>setQualsText(e.target.value)} placeholder="CSCS, ECS, IPAF, Degree" />
            </div>
          </div>

          {job && (
            <div className="mt-2">
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => setShowDesc(v => !v)}
              >
                {showDesc ? 'Hide descriptions' : 'Show descriptions'}
              </button>

              {showDesc && (
                <div className="grid gap-4 mt-3">
                  <div>
                    <div className="text-gray-500 mb-1">Public Description</div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{job.public_description || '—'}</p>
                  </div>
                  {job.internal_description && (
                    <div>
                      <div className="text-gray-500 mb-1">Internal Description</div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{job.internal_description}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {scored.length > 0 ? (
            <>
              <Table rows={scored} sortBy={sortBy} setSortBy={setSortBy} filter={filter} setFilter={setFilter} />
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-600">
                  {showingTo
                    ? <>Showing <span className="font-medium">{showingFrom}</span>–<span className="font-medium">{showingTo}</span> of <span className="font-medium">{showingTo}</span></>
                    : 'No results'}
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-grey" disabled>Prev</button>
                  <button className="btn btn-grey" disabled>Next</button>
                </div>
              </div>
            </>
          ) : rawCands.length > 0 ? (
            <div className="card p-6">
              <h3 className="font-semibold mb-3">Raw Candidates</h3>
              <ul className="divide-y">
                {rawCands.slice(0, pageSize).map(c => (
                  <li key={c.id} className="py-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{c.name || c.id}</div>
                        <div className="text-sm text-gray-600">
                          {(c.title || '-')}{c.location ? ` • ${c.location}` : ''}
                        </div>
                        {c.linkedin && (
                          <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-sm underline">
                            LinkedIn
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">ID: {c.id}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-sm text-gray-600">
                Showing <span className="font-medium">{showingFrom}</span>–<span className="font-medium">{Math.min(pageSize, rawCands.length)}</span> of <span className="font-medium">{rawCands.length}</span>
              </div>
            </div>
          ) : (
            <div className="card p-6 text-sm text-gray-500">
              Results will appear here after you click <span className="font-medium">Search Candidates</span>.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SourceTab() {
  const jotformUrl = process.env.NEXT_PUBLIC_JOTFORM_URL || ''
  const hasUrl = jotformUrl.length > 0
  const formId = hasUrl ? (jotformUrl.match(/\/(\d{10,})(?:$|[/?#])/i)?.[1] ?? null) : null
  const [height, setHeight] = useState<number>(900)
  const [iframeKey, setIframeKey] = useState(0)
  const refreshForm = () => setIframeKey(k => k + 1)

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!formId) return
      if (typeof e.data !== 'string') return
      const parts = e.data.split(':')
      if (parts[0] === 'setHeight') {
        const newH = Number(parts[1])
        if (!Number.isNaN(newH) && newH > 0) setHeight(newH + 20)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [formId])

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="m-0">Complete the form below to source relevant candidates directly to your email inbox.</p>
        {hasUrl && (
          <button className="btn btn-brand" onClick={refreshForm} title="Reload form">
            Refresh
          </button>
        )}
      </div>

      {!hasUrl ? (
        <div className="border-2 border-dashed rounded-2xl p-10 text-center text-gray-500">
          <div className="mb-2 text-5xl">🧾</div>
          <div className="font-semibold mb-2">JotForm Integration</div>
          <p className="mb-2">
            Add your form URL in the Vercel env var <code>NEXT_PUBLIC_JOTFORM_URL</code> and redeploy.
          </p>
          <p className="text-xs break-all">Example: https://form.jotform.com/123456789012345</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border">
          <iframe
            key={iframeKey}
            id={formId ? `JotFormIFrame-${formId}` : 'JotFormIFrame'}
            title="JotForm"
            src={jotformUrl}
            className="w-full"
            style={{ height }}
            scrolling="no"
            frameBorder={0}
            allow="clipboard-write; fullscreen"
          />
        </div>
      )}
    </div>
  )
}

function CvTab() {
  const [candidateId, setCandidateId] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    if (!candidateId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}`)
      const data = await r.json()
      setResult(data)
    } catch (e) {
      console.error(e)
      alert('Failed to retrieve candidate. Are you logged in and do you have a valid Candidate ID?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-6">
      <p className="mb-4">Enter a Candidate ID to fetch details from Vincere. We will format this into your CV layout later.</p>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-sm text-gray-600">Candidate ID</label>
          <input className="input mt-1" placeholder="Enter Candidate ID" value={candidateId} onChange={e=>setCandidateId(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-brand w-full" onClick={generate} disabled={loading}>
        {loading ? 'Fetching…' : 'Generate CV Preview'}
      </button>

      {result && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Raw Candidate Data</h3>
          <pre className="rounded-2xl border p-4 text-sm overflow-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [tab, setTab] = useState<TabKey>('match')
  return (
    <div>
      {/* KPIs section removed from display */}
      {/* <KPIs /> */}
      <Tabs tab={tab} setTab={setTab} />
      {tab==='match' && <MatchTab />}
      {tab==='source' && <SourceTab />}
      {tab==='cv' && <CvTab />}
    </div>
  )
}

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
  location?: string
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

  const [scored, setScored] = useState<ScoredRow[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [sortBy, setSortBy] = useState<[keyof ScoredRow, 'asc'|'desc']>(['score','desc'])
  const [filter, setFilter] = useState('')

  // pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  // NEW: hide/show descriptions
  const [showDesc, setShowDesc] = useState(false)

  const retrieveJob = async () => {
    if (!jobId) return
    setLoadingJob(true)
    setScored([])
    setPage(1)
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

      setJob({
        id: jobId,
        job_title: String(extracted?.title || '').trim(),
        location: String(extracted?.location || '').trim(),
        skills: skillsArr,
        qualifications: qualsArr,
        public_description: publicRaw,
        internal_description: internalRaw,
        coords: null
      })

      setTitle(String(extracted?.title || '').trim())
      setLocation(String(extracted?.location || '').trim())
      setSkillsText(skillsArr.join(', '))
      setQualsText(qualsArr.join(', '))

    } catch (e) {
      console.error(e)
      alert('Failed to retrieve or extract job details.')
    } finally {
      setLoadingJob(false)
    }
  }

  const runSearch = async (targetPage = page) => {
    if (!job) return
    setLoadingSearch(true)
    try {
      const r = await fetch('/api/match/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: {
            title,
            location,
            skills: skillsText.split(',').map(s => s.trim()).filter(Boolean),
            qualifications: qualsText.split(',').map(s => s.trim()).filter(Boolean),
            description: job.public_description
          },
          page: targetPage,
          limit: pageSize
        })
      })
      const res = await r.json()
      setScored(res?.results ?? [])
      setTotal(Number(res?.total ?? 0))
      setPage(Number(res?.page ?? targetPage))
    } catch (e) {
      console.error(e)
      alert('Search or scoring failed.')
    } finally {
      setLoadingSearch(false)
    }
  }

  const searchCandidates = async () => {
    if (!job) return alert('Retrieve Job Information first.')
    setPage(1)
    await runSearch(1)
  }

  const canPrev = page > 1
  const canNext = page * pageSize < total
  const showingFrom = total ? (page - 1) * pageSize + 1 : 0
  const showingTo = total ? Math.min(page * pageSize, total) : 0

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
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <button className="btn btn-grey" onClick={retrieveJob} disabled={loadingJob}>
            {loadingJob ? 'Retrieving…' : 'Retrieve Job Information'}
          </button>
          <div>
            <label className="text-sm text-gray-600">Page size</label>
            <select className="input mt-1" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
              {[10,20,30,50].map(n=> <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
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
              <div className="text-gray-500">Title</div>
              <input className="input mt-1" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g., Fire & Security Engineer" />
            </div>
            <div>
              <div className="text-gray-500">Location</div>
              <input className="input mt-1" value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g., London, UK" />
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
                  {total
                    ? <>Showing <span className="font-medium">{showingFrom}</span>–<span className="font-medium">{showingTo}</span> of <span className="font-medium">{total}</span></>
                    : 'No results'}
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-grey" disabled={!canPrev || loadingSearch} onClick={()=> canPrev && runSearch(page - 1)}>Prev</button>
                  <button className="btn btn-grey" disabled={!canNext || loadingSearch} onClick={()=> canNext && runSearch(page + 1)}>Next</button>
                </div>
              </div>
            </>
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
      <KPIs />
      <Tabs tab={tab} setTab={setTab} />
      {tab==='match' && <MatchTab />}
      {tab==='source' && <SourceTab />}
      {tab==='cv' && <CvTab />}
    </div>
  )
}

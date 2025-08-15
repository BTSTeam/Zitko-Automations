'use client'
import { useState, useEffect, type Dispatch, type SetStateAction, type ReactNode } from 'react'

type TabKey = 'match' | 'source' | 'cv'

type JobSummary = {
  id?: string
  job_title?: string
  location?: string
  industry?: any
  skills?: string[]
  public_description?: string
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

function Table({ rows, sortBy, setSortBy, filter, setFilter } : { rows: ScoredRow[], sortBy: [keyof ScoredRow, 'asc'|'desc'], setSortBy: (s:[keyof ScoredRow,'asc'|'desc'])=>void, filter: string, setFilter: (v:string)=>void }) {
  const sorted = [...rows].sort((a,b)=>{
    const [key, dir] = sortBy
    const va = a[key], vb = b[key]
    let cmp = 0
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
    else cmp = String(va).localeCompare(String(vb))
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
          <thead><tr className="text-left text-gray-600">
            {header('candidateId','Candidate ID')}
            {header('candidateName','Candidate Name')}
            {header('score','Suitability Score')}
            {header('reason','Reason')}
            <th>Link</th>
          </tr></thead>
          <tbody>
            {sorted.slice(0,10).map(r=> (
              <tr key={r.candidateId} className="border-t">
                <td className="py-2">{r.candidateId}</td>
                <td>{r.candidateName}</td>
                <td>{r.score}</td>
                <td>{r.reason}</td>
                <td><a className="text-brand-orange underline" href={`https://zitko.vincere.io/app/candidate/${r.candidateId}`} target="_blank">View</a></td>
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
  const [scored, setScored] = useState<ScoredRow[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [sortBy, setSortBy] = useState<[keyof ScoredRow, 'asc'|'desc']>(['score','desc'])
  const [filter, setFilter] = useState('')

  const retrieveJob = async () => {
    if (!jobId) return
    setLoadingJob(true)
    setScored([])
    try {
      const r = await fetch(`/api/vincere/position/${encodeURIComponent(jobId)}`)
      const data = await r.json()
      setJob({
        id: jobId,
        job_title: data?.job_title || data?.title || '',
        location: data?.location || data?.city || '',
        industry: data?.industry,
        skills: data?.skills || [],
        public_description: data?.public_description || data?.description || '',
        coords: null
      })
    } catch (e) {
      console.error(e)
      alert('Failed to retrieve job. Are you logged in and do you have a valid Job ID?')
    } finally {
      setLoadingJob(false)
    }
  }

  const searchCandidates = async () => {
    if (!job) return alert('Retrieve Job Information first.')
    setLoadingSearch(true)
    try {
      // 1) Vincere candidate search (proxy builds URL with priority rules)
      const r = await fetch('/api/vincere/candidate/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: job.job_title,
          locationText: job.location,
          industryIds: [],
          skills: job.skills || [],
          qualifications: []
        })
      })
      const res = await r.json()
      const docs = res?.response?.docs || res?.data || []
      const candidates: CandidateRow[] = docs
        .map((d: any): CandidateRow => ({
          id: String(d.id ?? d.candidate_id ?? ''),
          name: [d.first_name, d.last_name].filter(Boolean).join(' '),
          location: d.current_location,
          skills: d.skills
        }))
        .filter((c: CandidateRow) => !!c.id)

      // 2) Send to AI for scoring
      const ai = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: {
            title: job.job_title,
            location: job.location,
            industry: job.industry,
            skills: job.skills,
            description: job.public_description
          },
          candidates: candidates
        })
      })
      const aiJson = await ai.json()
      // Expecting { results: ScoredRow[] } or similar
      const maybe = aiJson?.results || aiJson?.candidates || aiJson
      const norm: ScoredRow[] = Array.isArray(maybe) ? maybe : (maybe?.data || [])
      setScored(norm)
    } catch (e) {
      console.error(e)
      alert('Search or scoring failed.')
    } finally {
      setLoadingSearch(false)
    }
  }

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
        <div className="grid gap-3">
          <button className="btn btn-grey" onClick={retrieveJob} disabled={loadingJob}>
            {loadingJob ? 'Retrieving…' : '📄 Retrieve Job Information'}
          </button>
          <button className="btn btn-brand" onClick={searchCandidates} disabled={!job || loadingSearch}>
            {loadingSearch ? 'Searching…' : '🔎 Search Candidates'}
          </button>
        </div>
      </div>

      {job && (
        <div className="card p-6">
          <h3 className="font-semibold mb-3">Job Summary</h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div><div className="text-gray-500">Title</div><div className="font-medium">{job.job_title || '—'}</div></div>
            <div><div className="text-gray-500">Location</div><div className="font-medium">{job.location || '—'}</div></div>
            <div><div className="text-gray-500">Industry</div><div className="font-medium">{Array.isArray(job.industry)? job.industry.join(', ') : (job.industry || '—')}</div></div>
            <div><div className="text-gray-500">Skills</div><div className="font-medium">{job.skills?.join(', ') || '—'}</div></div>
          </div>
          <div className="mt-4">
            <div className="text-gray-500 mb-1">Public Description</div>
            <div className="prose max-w-none text-sm whitespace-pre-wrap">{job.public_description || '—'}</div>
          </div>
        </div>
      )}

      {scored.length > 0 && (
        <Table rows={scored} sortBy={sortBy} setSortBy={setSortBy} filter={filter} setFilter={setFilter} />
      )}
    </div>
  )
}

function SourceTab() {
  // Read your JotForm URL from the env var you set in Vercel
  const jotformUrl = process.env.NEXT_PUBLIC_JOTFORM_URL || ''
  const hasUrl = jotformUrl.length > 0

  // Try to extract the numeric JotForm form ID from the URL
  const formId = hasUrl ? (jotformUrl.match(/\/(\d{10,})(?:$|[/?#])/i)?.[1] ?? null) : null

  // Height state that will be updated by postMessage from JotForm
  const [height, setHeight] = useState<number>(900)

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!formId) return
      if (typeof e.data !== 'string') return
      const parts = e.data.split(':')
      // JotForm sends messages like: "setHeight:1234" (and other commands)
      if (parts[0] === 'setHeight') {
        const newH = Number(parts[1])
        if (!Number.isNaN(newH) && newH > 0) {
          // add a little padding so the form bottom isn't tight
          setHeight(newH + 20)
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [formId])

  return (
    <div className="card p-6">
      <p className="mb-4">Embedded form integration for seamless candidate data collection.</p>

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
            id={formId ? `JotFormIFrame-${formId}` : 'JotFormIFrame'}
            title="JotForm"
            src={jotformUrl}
            className="w-full"
            style={{ height }}
            // Key bits: prevent inner scrollbars; height is controlled by postMessage above
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
        {loading ? 'Fetching…' : '👁️ Generate CV Preview'}
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

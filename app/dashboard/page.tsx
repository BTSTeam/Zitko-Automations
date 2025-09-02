// app/dashboard/page.tsx
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

function cityOnly(loc?: string): string {
  if (!loc) return ''
  let s = (loc.split(',')[0] || '').trim()
  s = s.replace(/\s+/g, ' ')
  const qualifier = /^(?:(?:north|south|east|west)(?:\s*[- ]\s*(?:east|west))?|central|centre|greater|inner|outer|city of)\s+/i
  while (qualifier.test(s)) s = s.replace(qualifier, '').trim()
  return s
}

function Tabs({ tab, setTab }: { tab: TabKey; setTab: Dispatch<SetStateAction<TabKey>> }) {
  const Item = ({ id, children }: { id: TabKey; children: ReactNode }) => (
    <button onClick={() => setTab(id)} className={`tab ${tab === id ? 'tab-active' : ''}`}>{children}</button>
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
              {header('score','Candidate')}
              {header('candidateName','Candidate Name')}
              <th>LinkedIn & AI Summary</th>
              <th>Vincere</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r=> (
              <tr key={r.candidateId} className="border-t align-top">
                <td className="py-3">
                  <div className="text-2xl font-semibold">{r.score}%</div>
                  <div className="text-xs text-gray-500 mt-1">ID: {r.candidateId}</div>
                </td>
                <td className="py-3">{r.candidateName}</td>
                <td className="py-3">
                  {r.linkedin
                    ? <a className="text-brand-orange underline" href={r.linkedin} target="_blank" rel="noreferrer">Open</a>
                    : '—'}
                  {r.reason ? <div className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{r.reason}</div> : null}
                </td>
                <td className="py-3">
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
  // …your existing state…
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobSummary | null>(null)
  const [loadingJob, setLoadingJob] = useState(false)

  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [qualsText, setQualsText] = useState('')

  const [scored, setScored] = useState<ScoredRow[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [sortBy, setSortBy] = useState<[keyof ScoredRow, 'asc'|'desc']>(['score','desc'])
  const [filter, setFilter] = useState('')
  const [total, setTotal] = useState(0)

  // --- replace the whole runSearch with this version ---
  const runSearch = async () => {
    setLoadingSearch(true)
    setScored([])
    setTotal(0)

    try {
      // 1) Always run Vincere search first (this preserves your original behaviour)
      const runResp = await fetch('/api/match/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: {
            title,
            location,
            skills: skillsText.split(',').map(s=>s.trim()).filter(Boolean),
            qualifications: qualsText.split(',').map(s=>s.trim()).filter(Boolean),
            description: job?.public_description || ''
          },
          limit: 100
        })
      })
      const runPayload = await runResp.json()
      console.log('[match/run] status=', runResp.status, 'payload=', runPayload)

      if (!runResp.ok) {
        // Surface the *exact* failing URL/q from the API for easy diagnosis
        const url = runPayload?.url
        const qRaw = runPayload?.qRaw
        throw new Error(`Vincere search failed (${runResp.status})\nURL: ${url}\nq: ${qRaw}\nDetail: ${runPayload?.detail || 'n/a'}`)
      }

      const candidates = (runPayload?.results || []) as Array<{
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

      if (candidates.length === 0) {
        setTotal(0)
        setScored([])
        return
      }

      // 2) Then send those results to ChatGPT for scoring (before rendering)
      const aiResp = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: { 
            title, 
            location, 
            skills: skillsText.split(',').map(s=>s.trim()).filter(Boolean),
            qualifications: qualsText.split(',').map(s=>s.trim()).filter(Boolean),
            description: job?.public_description || ''
          },
          candidates: candidates.map(c => ({
            candidate_id: c.id,
            full_name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
            location: c.location || c.city || '',
            current_job_title: c.title || '',
            skills: c.skills || [],
            qualifications: c.qualifications || [],
            linkedin: c.linkedin ?? null,
          }))
        })
      })

      // If AI endpoint fails, show a clear error (no raw fallback unless you want it)
      if (!aiResp.ok) {
        const errText = await aiResp.text().catch(()=> '')
        throw new Error(`AI analyze failed (${aiResp.status}): ${errText}`)
      }

      const { ranked = [] } = await aiResp.json().catch(() => ({ ranked: [] as any[] }))

      // 3) Merge + filter + sort, then present
      const byId = new Map(candidates.map(c => [String(c.id), c]))
      const filteredSorted = (ranked as any[])
        .filter(r => (Number(r?.score_percent) || 0) >= 50)
        .sort((a,b) => (Number(b?.score_percent) || 0) - (Number(a?.score_percent) || 0))

      const scoredRows: ScoredRow[] = filteredSorted.map(r => {
        const c = byId.get(String(r.candidate_id))
        const candidateName =
          c?.fullName || `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || String(r.candidate_id)
        return {
          candidateId: String(r.candidate_id),
          candidateName,
          score: Math.round(Number(r.score_percent) || 0),
          reason: String(r.reason || ''),
          linkedin: c?.linkedin || undefined
        }
      })

      setScored(scoredRows)
      setTotal(scoredRows.length)
    } catch (e: any) {
      console.error(e)
      setScored([])
      setTotal(0)
      alert(e?.message || 'Search/AI failed')
    } finally {
      setLoadingSearch(false)
    }
  }

  const searchCandidates = async () => {
    if (!job) return alert('Retrieve Job Information first.')
    await runSearch()
  }

 return (
  <div className="grid gap-6">
    <div className="card p-6">
      <p className="mb-4">Enter your Vincere Job ID to return the job details.</p>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-sm text-gray-600">Job ID</label>
          <input
            className="input mt-1"
            placeholder="Enter Job ID"
            value={jobId}
            onChange={e => setJobId(e.target.value)}
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 items-end">
        <button className="btn btn-grey" onClick={retrieveJob} disabled={loadingJob}>
          {loadingJob ? 'Retrieving…' : 'Retrieve Job Information'}
        </button>
        <button
          className="btn btn-brand"
          onClick={runSearch}
          disabled={loadingSearch}
        >
          {loadingSearch ? 'Searching…' : 'Search Candidates'}
        </button>
      </div>
    </div>

    <div className="grid md:grid-cols-2 gap-6">
      <div className="card p-6">
        <h3 className="font-semibold mb-3">Job Summary (review & edit)</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <div className="text-gray-500">Job Title</div>
            <input
              className="input mt-1"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Fire & Security Engineer"
            />
          </div>
          <div>
            <div className="text-gray-500">Location</div>
            <input
              className="input mt-1"
              value={location}
              onChange={e => setLocation(e.target.value)}
              onBlur={e => setLocation(cityOnly(e.target.value))}
              placeholder="e.g., London, UK"
            />
          </div>
          <div className="sm:col-span-2">
            <div className="text-gray-500">Skills (comma-separated)</div>
            <input
              className="input mt-1"
              value={skillsText}
              onChange={e => setSkillsText(e.target.value)}
              placeholder="CCTV, Access Control, IP Networking"
            />
          </div>
          <div className="sm:col-span-2">
            <div className="text-gray-500">Qualifications (comma-separated)</div>
            <input
              className="input mt-1"
              value={qualsText}
              onChange={e => setQualsText(e.target.value)}
              placeholder="CSCS, ECS, IPAF, Degree"
            />
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
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {job.public_description || '—'}
                  </p>
                </div>
                {job.internal_description && (
                  <div>
                    <div className="text-gray-500 mb-1">Internal Description</div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {job.internal_description}
                    </p>
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
            <Table
              rows={scored}
              sortBy={sortBy}
              setSortBy={setSortBy}
              filter={filter}
              setFilter={setFilter}
            />
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-600">
                Showing <span className="font-medium">{scored.length}</span> candidates ≥ 50%
              </div>
              <div className="flex gap-2">
                <button className="btn btn-grey" disabled>Prev</button>
                <button className="btn btn-grey" disabled>Next</button>
              </div>
            </div>
          </>
        ) : (
          <div className="card p-6 text-sm text-gray-500">
            No candidates meet the <span className="font-medium">50%</span> suitability threshold.
          </div>
        )}
      </div>
    </div>
  </div>
)

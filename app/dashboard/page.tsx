// app/dashboard/page.tsx
// Single-button pipeline + layout tweaks + rotating fun messages + AI list view with % score
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
  title?: string          // <— added for AI list layout
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

// normalize any location string to city-only
function extractCity(location?: string): string {
  if (!location) return ''
  let city = location.split(',')[0].trim()
  city = city.replace(/\b(North|South|East|West|Northeast|Northwest|Southeast|Southwest)\b/gi, ' ').trim()
  city = city.replace(/\s{2,}/g, ' ').trim()
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
    <button onClick={() => setTab(id)} className={`tab ${tab === id ? 'tab-active' : ''}`}>
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

/** ---------- New: AI list component (score % on right; reason below link/title) ---------- */
function AIScoredList({
  rows, filter, setFilter
}: {
  rows: ScoredRow[],
  filter: string,
  setFilter: (v:string)=>void
}) {
  const filtered = rows.filter(r =>
    JSON.stringify(r).toLowerCase().includes(filter.toLowerCase())
  )
  return (
    <div className="card p-6">
      <div className="mb-3">
        <input className="input" placeholder="Filter..." value={filter} onChange={e=>setFilter(e.target.value)} />
      </div>
      <ul className="divide-y">
        {filtered.map(r => (
          <li key={r.candidateId} className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.candidateName}</div>
                {!!r.title && <div className="text-sm text-gray-600">{r.title}</div>}
                {r.linkedin
                  ? <a className="text-sm underline" href={r.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
                  : null}
                {r.reason && (
                  <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                    {r.reason}
                  </div>
                )}
              </div>

              <div className="text-right shrink-0 min-w-[110px]">
                <div className="text-2xl font-semibold">{r.score}%</div>
                <div className="text-xs text-gray-500 mt-1">ID: {r.candidateId}</div>
                <a
                  className="text-xs text-brand-orange underline mt-1 inline-block"
                  href={`https://zitko.vincere.io/app/candidate/${r.candidateId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View in Vincere
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
/** --------------------------------------------------------------------------------------- */

function MatchTab() {
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobSummary | null>(null)

  const [loadingJob, setLoadingJob] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)

  // extracted + editable fields (from OpenAI)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [qualsText, setQualsText] = useState('')

  // raw & scored candidates
  const [rawCands, setRawCands] = useState<CandidateRow[]>([])
  const [scored, setScored] = useState<ScoredRow[]>([])

  // sorting / filter (sorting already applied by score desc before render)
  const [sortBy] = useState<[keyof ScoredRow, 'asc'|'desc']>(['score','desc'])
  const [filter, setFilter] = useState('')

  // which list is visible (toggle)
  const [view, setView] = useState<'ai' | 'raw'>('raw')

  const pageSize = 20
  const [total, setTotal] = useState(0)

  // show/hide descriptions
  const [showDesc, setShowDesc] = useState(false)

  // FUN rotating messages while AI scoring (≤10-word lyric nods)
  const funMessages = [
    'Verifying raw candidates…',
    "I want it that way.",
    'Oops! I did it again.',
    'Hit me baby one more time.',
    "Backstreet\'s back, alright!",
    'Stronger than yesterday.',
    'Everybody, rock your body.',
    'Shortlisting like a boss.',
    'Tuning the match engine…',
  ]
  const [funIdx, setFunIdx] = useState(0)
  useEffect(() => {
    if (!loadingSearch) return
    setFunIdx(0)
    const id = setInterval(() => setFunIdx(i => (i + 1) % funMessages.length), 2200)
    return () => clearInterval(id)
  }, [loadingSearch])

  // --- Retrieve Job: returns JobSummary ---
  const retrieveJob = async (): Promise<JobSummary | null> => {
    if (!jobId) return null
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

      const cleanedLocation = extractCity(String(extracted?.location || '').trim())

      const summary: JobSummary = {
        id: jobId,
        job_title: String(extracted?.title || '').trim(),
        location: cleanedLocation,
        skills: skillsArr,
        qualifications: qualsArr,
        public_description: publicRaw,
        internal_description: internalRaw,
        coords: null
      }

      // update UI state
      setJob(summary)
      setTitle(summary.job_title || '')
      setLocation(cleanedLocation)
      setSkillsText(skillsArr.join(', '))
      setQualsText(qualsArr.join(', '))

      return summary
    } catch (e) {
      console.error(e)
      alert('Failed to retrieve or extract job details.')
      return null
    } finally {
      setLoadingJob(false)
    }
  }

  // --- Search + AI Score: accepts explicit input to avoid state races ---
  const runSearch = async (input?: {
    job: JobSummary
    title: string
    location: string
    skillsText: string
    qualsText: string
  }) => {
    const active = input ?? (job ? {
      job,
      title,
      location,
      skillsText,
      qualsText
    } : null)

    if (!active) return
    const { job: activeJob, title: t, location: loc, skillsText: skillsStr, qualsText: qualsStr } = active

    setLoadingSearch(true)
    setScored([])
    setRawCands([])

    try {
      // 1) Vincere candidate search
      const run = await fetch('/api/match/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: {
            title: t,
            location: loc,
            skills: skillsStr.split(',').map(s=>s.trim()).filter(Boolean),
            qualifications: qualsStr.split(',').map(s=>s.trim()).filter(Boolean),
            description: activeJob.public_description || ''
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

      // Raw list immediately
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
      setView('raw')

      // 2) AI scoring
      const ai = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: {
            title: t,
            location: loc,
            skills: skillsStr.split(',').map(s => s.trim()).filter(Boolean),
            qualifications: qualsStr.split(',').map(s => s.trim()).filter(Boolean),
            description: activeJob.public_description || ''
          },
          candidates: candidates.map(c => ({
            candidate_id: c.id,
            full_name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
            location: c.location || c.city || '',
            current_job_title: c.title || '',
            skills: c.skills || [],
            qualifications: c.qualifications || []
          }))
        })
      })

      const aiText = await ai.text()
      // Robust parse (direct or OpenAI-wrapped)
      let outer: any = {}
      try { outer = JSON.parse(aiText) } catch { outer = {} }

      let rankedObj: any
      if (Array.isArray(outer?.ranked)) {
        rankedObj = outer
      } else {
        const content = outer?.choices?.[0]?.message?.content
        if (typeof content === 'string') {
          try { rankedObj = JSON.parse(content) } catch { rankedObj = {} }
        } else {
          rankedObj = {}
        }
      }

      const allSorted =
        (Array.isArray(rankedObj?.ranked) ? rankedObj.ranked : [])
          .map((r: any) => ({
            candidate_id: String(r.candidate_id),
            score_percent: Number(r.score_percent) || 0,
            reason: String(r.reason || '')
          }))
          .sort((a: any, b: any) => b.score_percent - a.score_percent)

      const byId = new Map(candidates.map(c => [String(c.id), c]))
      const scoredRows: ScoredRow[] = allSorted.map((r: any) => {
        const c = byId.get(String(r.candidate_id))
        const candidateName =
          c?.fullName || `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || String(r.candidate_id)
        return {
          candidateId: String(r.candidate_id),
          candidateName,
          score: Math.round(r.score_percent),
          reason: r.reason,
          linkedin: c?.linkedin || undefined,
          title: c?.title || ''    // <— carry the job title for list view
        }
      })

      if (scoredRows.length > 0) {
        setScored(scoredRows)
        setTotal(scoredRows.length)
        setView('ai')
      }
    } catch (e) {
      console.error(e)
      alert('Search or scoring hit an issue. Showing raw candidates (if any).')
    } finally {
      setLoadingSearch(false)
    }
  }

  // --- Orchestrator: single click to run all steps ---
  const retrieveSearchScore = async () => {
    if (!jobId) return alert('Enter Job ID')
    setLoadingAll(true)
    try {
      const summary = await retrieveJob()
      if (!summary) return
      const t = String(summary.job_title || '').trim()
      const loc = String(summary.location || '').trim()
      const skillsStr = (summary.skills || []).join(', ')
      const qualsStr  = (summary.qualifications || []).join(', ')
      await runSearch({ job: summary, title: t, location: loc, skillsText: skillsStr, qualsText: qualsStr })
    } finally {
      setLoadingAll(false)
    }
  }

  const displayCount = (view === 'ai' ? scored.length : rawCands.length)
  const showingFrom = displayCount ? 1 : 0
  const showingTo = displayCount || 0

  const statusText = loadingSearch
    ? funMessages[funIdx]
    : (view === 'ai' ? 'Viewing AI scores' : 'Viewing raw results')

  return (
    <div className="grid gap-6">
      {/* TOP CARD: two columns: left = Job ID, right = Job Summary */}
      <div className="card p-6">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Job ID / intro */}
          <div>
            <p className="mb-4">Enter your Vincere Job ID to return the job details.</p>
            <div>
              <label className="text-sm text-gray-600">Job ID</label>
              <input
                className="input mt-1"
                placeholder="Enter Job ID"
                value={jobId}
                onChange={e=>setJobId(e.target.value)}
              />
            </div>
            <button
              className="btn btn-brand mt-4 w-full"
              onClick={retrieveSearchScore}
              disabled={loadingAll || !jobId}
              title={!jobId ? 'Enter a Job ID' : 'Retrieve job, search & score'}
            >
              {loadingAll ? 'Searching…' : 'Search'}
            </button>
          </div>

          {/* Right: Job Summary (editable, no title) */}
          <div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm mb-2">
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
              <div className="mt-1">
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={() => setShowDesc(v => !v)}
                >
                  {showDesc ? 'Hide descriptions' : 'Show descriptions'}
                </button>

                {showDesc && (
                  <div className="grid gap-2 mt-2">
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
        </div>

        {/* Toggle row under the card */}
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <button
            className={`btn ${view==='raw' ? 'btn-brand' : 'btn-grey'}`}
            onClick={() => setView('raw')}
            disabled={rawCands.length === 0}
            title={rawCands.length === 0 ? 'No raw results yet' : 'View raw candidates'}
          >
            Raw Candidates {rawCands.length ? `(${rawCands.length})` : ''}
          </button>
          <button
            className={`btn ${view==='ai' ? 'btn-brand' : 'btn-grey'}`}
            onClick={() => setView('ai')}
            disabled={scored.length === 0}
            title={scored.length === 0 ? 'No AI scores yet' : 'View AI-scored results'}
          >
            AI Scored {scored.length ? `(${scored.length})` : ''}
          </button>

          <div className="text-sm text-gray-600 ml-auto">
            {statusText}
          </div>
        </div>
      </div>

      {/* RESULTS (single, full-width panel) */}
      <div className="flex flex-col gap-3">
        {view === 'ai' ? (
          scored.length > 0 ? (
            <>
              <AIScoredList rows={scored} filter={filter} setFilter={setFilter} />
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-600">
                  Showing <span className="font-medium">{showingFrom}</span>–
                  <span className="font-medium">{showingTo}</span> of
                  <span className="font-medium"> {showingTo}</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-grey" disabled>Prev</button>
                  <button className="btn btn-grey" disabled>Next</button>
                </div>
              </div>
            </>
          ) : (
            <div className="card p-6 text-sm text-gray-500">
              {loadingSearch ? funMessages[funIdx] : 'No AI scores yet. Click "Search".'}
            </div>
          )
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
              Showing <span className="font-medium">{rawCands.length ? 1 : 0}</span>–
              <span className="font-medium">{Math.min(pageSize, rawCands.length)}</span> of
              <span className="font-medium"> {rawCands.length}</span>
            </div>
          </div>
        ) : (
          <div className="card p-6 text-sm text-gray-500">
            Results will appear here after you click <span className="font-medium">Search</span>.
          </div>
        )}
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
      const parts = e.data split(':')
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

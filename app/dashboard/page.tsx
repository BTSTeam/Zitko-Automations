// app/dashboard/page.tsx
// Dashboard updated to show AI-scored candidates (≥50%) in the requested card layout.
// Falls back to Raw Candidates if no scores are available.
// Page Size dropdown remains removed; KPIs hidden.
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
  title?: string
  location?: string
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

function MatchTab() {
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobSummary | null>(null)
  const [loadingJob, setLoadingJob] = useState(false)

  // extracted + editable fields (from OpenAI)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [qualsText, setQualsText] = useState('')

  // raw candidates as fallback
  const [rawCands, setRawCands] = useState<CandidateRow[]>([])

  // AI-scored list
  const [scored, setScored] = useState<ScoredRow[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)

  // pagination (fixed 20; dropdown removed)
  const pageSize = 20
  const [total, setTotal] = useState(0)

  // toggle descriptions
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

  // Helper to map payload.results (if API already scored) to ScoredRow[]
  function mapPayloadToScored(results: any[]): ScoredRow[] {
    return results
      .filter(r => typeof r.score === 'number' && r.score >= 50)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map(r => ({
        candidateId: String(r.id ?? r.candidateId ?? ''),
        candidateName: String(r.fullName ?? r.candidateName ?? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()),
        title: r.title || r.current_job_title || '',
        location: r.location || r.current_location_name || '',
        score: Math.round(Number(r.score) || 0),
        reason: String(r.reason || '—'),
        linkedin: r.linkedin || undefined
      }))
  }

  // Run Vincere search, then try AI (either backend scored or separate /api/ai/analyze fallback)
  const runSearch = async () => {
    if (!job) return
    setLoadingSearch(true)
    setScored([])
    setRawCands([])
    setTotal(0)

    try {
      // 1) Vincere candidate search (+ maybe backend scoring)
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

      const results = Array.isArray(payload?.results) ? payload.results : []

      // If backend already returned scores (preferred path)
      const preScored = mapPayloadToScored(results)
      if (preScored.length > 0) {
        setScored(preScored)
        setTotal(preScored.length)
        return
      }

      // Otherwise, map raw for immediate fallback display
      const rawList: CandidateRow[] = results.map((c: any) => ({
        id: String(c.id ?? c.candidate_id ?? ''),
        name: String(((c.fullName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim())) || c.id),
        title: c.title || c.current_job_title || '',
        location: c.location || c.current_location_name || c.city || '',
        linkedin: c.linkedin ?? null,
        skills: Array.isArray(c.skills) ? c.skills : []
      }))
      setRawCands(rawList)
      setTotal(rawList.length)

      // 2) Fallback to separate AI analyze endpoint to get scores
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
          candidates: results.map((c: any) => ({
            candidate_id: String(c.id ?? c.candidate_id ?? ''),
            full_name: String(c.fullName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()),
            location: c.location || c.current_location_name || c.city || '',
            current_job_title: c.title || c.current_job_title || '',
            skills: Array.isArray(c.skills) ? c.skills : [],
            qualifications: [
              c.eduQualification, c.eduDegree, c.eduCourse, c.eduInstitution, c.eduTraining
            ].filter(Boolean)
          })),
          instruction: 'Return the top 50 as {candidate_id, score_percent, reason}.'
        })
      })

      const aiText = await ai.text()
      let ranked: { ranked?: { candidate_id: string; score_percent: number; reason: string }[] } = {}
      try { ranked = JSON.parse(aiText) } catch { ranked = {} }

      const byId = new Map(results.map((c: any) => [String(c.id ?? c.candidate_id ?? ''), c]))
      const scoredRows: ScoredRow[] = (ranked?.ranked || [])
  .map(r => {
    const c = byId.get(String(r.candidate_id))
    const name =
      (c?.fullName && c.fullName.trim()) ||
      (`${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim()) ||
      String(r.candidate_id)

    return {
      candidateId: String(r.candidate_id),
      candidateName: name,
      title: c?.title || c?.current_job_title || '',
      location: c?.location || c?.current_location_name || '',
      score: Math.round(Number(r.score_percent) || 0),
      reason: r.reason || '—',
      linkedin: c?.linkedin || undefined
    }
  })
  .filter(r => r.score >= 50)
  .sort((a, b) => b.score - a.score)

      if (scoredRows.length > 0) {
        setScored(scoredRows.slice(0, 50))
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

  // display counts
  const showingFrom = (scored.length || rawCands.length) ? 1 : 0
  const showingTo = scored.length || Math.min(pageSize, rawCands.length) || 0

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
          <h3 className="font-semibold mb-3">Job Summary</h3>

          <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <div className="text-gray-500">Job Title</div>
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

        {/* Right column: Scored cards (>={50}%) else Raw */}
        <div className="flex flex-col gap-3">
          {scored.length > 0 ? (
            <div className="card p-6">
              <h3 className="font-semibold mb-3">Top Matches (≥ 50%)</h3>
              <ul className="divide-y">
                {scored.map(c => (
                  <li key={c.candidateId} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{c.candidateName}</div>
                        <div className="text-sm text-gray-600">{c.title || '-'}</div>
                        {c.linkedin ? (
                          <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-sm underline">
                            LinkedIn
                          </a>
                        ) : (
                          <div className="text-sm text-gray-400">LinkedIn</div>
                        )}
                        <div className="mt-2 text-xs text-gray-500">Reason for Suitability Score</div>
                        <div className="text-sm">{c.reason || '—'}</div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div style={{ color: '#F7941D', fontWeight: 700, fontSize: '1.25rem', lineHeight: 1 }}>
                          {c.score}%
                        </div>
                        <div style={{ color: '#F7941D' }} className="text-sm mt-1">
                          ID:{c.candidateId || '00000'}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-3 text-sm text-gray-600">
                Showing <span className="font-medium">{showingFrom}</span>–<span className="font-medium">{scored.length}</span> of <span className="font-medium">{scored.length}</span>
              </div>
            </div>
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
      {/* KPIs section hidden */}
      <Tabs tab={tab} setTab={setTab} />
      {tab==='match' && <MatchTab />}
      {tab==='source' && <SourceTab />}
      {tab==='cv' && <CvTab />}
    </div>
  )
}

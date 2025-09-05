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
  title?: string
}

// ---------- helpers ----------
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

function extractCity(location?: string): string {
  if (!location) return ''
  let city = location.split(',')[0].trim()
  city = city.replace(/\b(North|South|East|West|Northeast|Northwest|Southeast|Southwest)\b/gi, ' ').trim()
  city = city.replace(/\s{2,}/g, ' ').trim()
  return city
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

// If AI fails, create a light heuristic score to avoid 0% walls
function fallbackScore(job: JobSummary, c: { title?: string, location?: string, skills?: string[]; qualifications?: string[] }) {
  const jSkills = new Set((job.skills || []).map(s => s.toLowerCase()))
  const jQuals  = new Set((job.qualifications || []).map(s => s.toLowerCase()))
  const cSkills = new Set((c.skills || []).map(s => s.toLowerCase()))
  const cQuals  = new Set((c.qualifications || []).map(s => s.toLowerCase()))
  const title   = (c.title || '').toLowerCase()
  const loc     = (c.location || '').toLowerCase()
  const jLoc    = (job.location || '').toLowerCase()
  const jTitle  = (job.job_title || '').toLowerCase()

  const interSkills = [...jSkills].filter(s => cSkills.has(s)).length
  const skillScore = jSkills.size ? (interSkills / jSkills.size) : 0

  const interQuals = [...jQuals].filter(s => cQuals.has(s)).length
  const qualScore = jQuals.size ? (interQuals / jQuals.size) : 0

  const titleScore = jTitle && title ? (title.includes(jTitle) || jTitle.includes(title) ? 1 : 0.5 * Number(title.split(' ').some(w => jTitle.includes(w)))) : 0
  const locScore = jLoc && loc ? (loc.includes(jLoc) ? 1 : 0) : 0

  const composite = 0.6*skillScore + 0.25*qualScore + 0.1*titleScore + 0.05*locScore
  return Math.round(composite * 100)
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

/** ---------- AI list (label horizontally with coloured %) ---------- */
function AIScoredList({ rows }: { rows: ScoredRow[] }) {
  const [copied, setCopied] = useState<string | null>(null)
  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(id)
      setTimeout(() => setCopied(null), 1200)
    } catch {}
  }
  return (
    <div className="card p-6">
      <ul className="divide-y">
        {rows.map(r => (
          <li key={r.candidateId} className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.candidateName}</div>
                {!!r.title && <div className="text-sm text-gray-600">{r.title}</div>}
                {r.linkedin && (
                  <a className="text-sm underline" href={r.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
                )}
                {r.reason && (
                  <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                    {r.reason}
                  </div>
                )}
              </div>

              <div className="text-right shrink-0 min-w-[180px]">
                <div className="flex items-baseline justify-end gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Suitability Score:</div>
                  <div className={`text-2xl font-semibold ${scoreColor(r.score)}`}>{r.score}%</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyId(r.candidateId)}
                  className="text-xs text-gray-600 mt-1" // no underline
                  title="Click to copy Candidate ID"
                >
                  ID: {r.candidateId}
                </button>
                {copied === r.candidateId && (
                  <div className="text-[10px] text-green-600 mt-1">Copied!</div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
/** -------------------------------- */

function MatchTab() {
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobSummary | null>(null)

  const [loadingAll, setLoadingAll] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)

  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [qualsText, setQualsText] = useState('') // hidden in UI, used for AI

  const [rawCands, setRawCands] = useState<CandidateRow[]>([])
  const [scored, setScored] = useState<ScoredRow[]>([])
  const [view, setView] = useState<'ai' | 'raw'>('raw')

  const [showDesc, setShowDesc] = useState(false)

  // fun status near AI Scored
  const funMessages = [
    'Zitko AI is thinking…',
    'Matching skills and qualifications…',
    'Cross-checking titles and keywords…',
    'Comparing to London location…',
    "Backstreet's back, alright!",
    'Oops! I did it again.',
    'Shortlisting like a boss.',
    'Finding near matches…',
  ]
  const [funIdx, setFunIdx] = useState(0)
  useEffect(() => {
    if (!loadingSearch) return
    setFunIdx(0)
    const id = setInterval(() => setFunIdx(i => (i + 1) % funMessages.length), 4000)
    return () => clearInterval(id)
  }, [loadingSearch])

  // --- Retrieve job
  const retrieveJob = async (): Promise<JobSummary | null> => {
    if (!jobId) return null
    setScored([]); setRawCands([])

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
        body: JSON.stringify({ publicDescription: publicRaw, internalDescription: internalRaw })
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
    }
  }

  // --- Run search + AI
  const runSearch = async (input?: {
    job: JobSummary
    title: string
    location: string
    skillsText: string
    qualsText: string
  }) => {
    const active = input ?? (job ? { job, title, location, skillsText, qualsText } : null)
    if (!active) return
    const { job: activeJob, title: t, location: loc, skillsText: skillsStr, qualsText: qualsStr } = active

    setLoadingSearch(true)
    setScored([]); setRawCands([])

    try {
      // Vincere search
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
        keywords?: string[]
      }>

      // Raw list now
      setRawCands(candidates.map(c => ({
        id: String(c.id),
        name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
        title: c.title || '',
        location: c.location || c.city || '',
        linkedin: c.linkedin ?? null,
        skills: c.skills || []
      })))
      setView('raw')

      // AI analyze
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
            qualifications: c.qualifications || [],
            keywords: c.keywords || []
          })),
          instruction:
            'Score every candidate 0–100%. Prioritise skills & formal qualifications matching the job; also consider job title relevance and London location proximity. In "reason", cite specific matched/missing skills/quals and any title/location notes. Avoid generic reasons.'
        })
      })

      const aiText = await ai.text()
      let outer: any = {}
      try { outer = JSON.parse(aiText) } catch { outer = {} }

      // Coerce variants: score_percent | score | score_pct | suitability_score
      const ranked = Array.isArray(outer?.ranked)
        ? outer.ranked
        : (() => {
            const content = outer?.choices?.[0]?.message?.content
            if (typeof content === 'string') {
              try { const p = JSON.parse(content); return Array.isArray(p?.ranked) ? p.ranked : [] } catch { return [] }
            }
            return []
          })()

      const byId = new Map(candidates.map(c => [String(c.id), c]))
      let scoredRows: ScoredRow[] = ranked.map((r: any) => {
        const scoreRaw = r.score_percent ?? r.score ?? r.score_pct ?? r.suitability_score ?? 0
        const s = Math.max(0, Math.min(100, Math.round(Number(scoreRaw) || 0)))
        const c = byId.get(String(r.candidate_id))
        const candidateName = c?.fullName || `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || String(r.candidate_id)
        return {
          candidateId: String(r.candidate_id),
          candidateName,
          score: s,
          reason: String(r.reason || ''),
          linkedin: c?.linkedin || undefined,
          title: c?.title || ''
        }
      }).sort((a, b) => b.score - a.score)

      // Fallback if model returned nothing/zeros
      if (scoredRows.length === 0 || scoredRows.every(r => r.score === 0)) {
        const j: JobSummary = {
          job_title: t,
          location: loc,
          skills: skillsStr.split(',').map(s => s.trim()).filter(Boolean),
          qualifications: qualsStr.split(',').map(s => s.trim()).filter(Boolean)
        }
        scoredRows = candidates.map(c => {
          const s = fallbackScore(j, { title: c.title, location: c.location || c.city, skills: c.skills, qualifications: c.qualifications })
          const reason = `Heuristic: ${s}% based on skills/quals/title/location overlap.`
          const candidateName = c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || String(c.id)
          return {
            candidateId: String(c.id),
            candidateName,
            score: s,
            reason,
            linkedin: c.linkedin || undefined,
            title: c.title || ''
          }
        }).sort((a,b)=>b.score-a.score)
      }

      setScored(scoredRows)
      setView('ai')
    } catch (e) {
      console.error(e)
      alert('Search or scoring hit an issue. Showing raw candidates (if any).')
    } finally {
      setLoadingSearch(false)
    }
  }

  // all-in-one button
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

  const statusText = loadingSearch
    ? ['Zitko AI is thinking…',
       'Matching skills and qualifications…',
       'Cross-checking titles and keywords…',
       'Comparing to location…'][funIdx % 4]
    : (view === 'ai' ? 'Viewing AI scores' : 'Viewing raw results')

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="mb-4">Enter your Vincere Job ID to return the job details.</p>
            <div>
              <label className="text-sm text-gray-600">Job ID</label>
              <input className="input mt-1" placeholder="Enter Job ID" value={jobId} onChange={e=>setJobId(e.target.value)} />
            </div>
            <button className="btn btn-brand mt-4 w-full" onClick={retrieveSearchScore} disabled={loadingAll || !jobId}>
              {loadingAll ? 'Searching…' : 'Search'}
            </button>
          </div>

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
              {/* Qualifications intentionally hidden from UI but used in scoring */}
            </div>

            {job && (
              <div className="mt-1">
                <button type="button" className="text-xs text-gray-500 underline" onClick={() => setShowDesc(v => !v)}>
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

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <button
            className={`btn ${view==='raw' ? 'btn-brand' : 'btn-grey'}`}
            onClick={() => setView('raw')}
            disabled={rawCands.length === 0}
          >
            Raw Candidates {rawCands.length ? `(${rawCands.length})` : ''}
          </button>
          <div className="flex items-center gap-2">
            <button
              className={`btn ${view==='ai' ? 'btn-brand' : 'btn-grey'}`}
              onClick={() => setView('ai')}
              disabled={scored.length === 0}
            >
              AI Scored {scored.length ? `(${scored.length})` : ''}
            </button>
            <span className="text-sm text-gray-600">{statusText}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {view === 'ai' ? (
          scored.length > 0
            ? <AIScoredList rows={scored} />
            : <div className="card p-6 text-sm text-gray-500">{loadingSearch ? funMessages[funIdx] : 'No AI scores yet. Click "Search".'}</div>
        ) : rawCands.length > 0 ? (
          <div className="card p-6">
            <h3 className="font-semibold mb-3">Raw Candidates</h3>
            <ul className="divide-y">
              {rawCands.map(c => (
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
      <Tabs tab={tab} setTab={setTab} />
      {tab==='match' && <MatchTab />}
      {tab==='source' && <SourceTab />}
      {tab==='cv' && <CvTab />}
    </div>
  )
}

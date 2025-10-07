'use client'

import { useEffect, useState, type ReactNode } from 'react'

/* ====================== Types ====================== */
type JobSummary = {
  id?: string
  job_title?: string
  location?: string
  skills?: string[]
  qualifications?: string[]
  public_description?: string
  internal_description?: string
  coords?: { lat: number; lng: number } | null
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
  matchedSkills?: string[]
  location?: string
}

/* ====================== Helpers (local) ====================== */
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
    return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

function extractCity(location?: string): string {
  if (!location) return ''
  let city = location.split(',')[0].trim()
  city = city.replace(/\b(North|South|East|West|Northeast|Northwest|Southeast|Southwest)\b/gi, ' ').trim()
  city = city.replace(/\s{2,}/g, ' ').trim()
  if (/london/i.test(city)) return 'London'
  return city
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function stem(s: string): string {
  const t = s.toLowerCase().replace(/[^a-z0-9+.#/ ]+/g, '').trim()
  return t.replace(/(ing|ed|es)\b/g, '').replace(/(\s{2,})/g, ' ').trim()
}

function normalizeList(...items: any[]): string[] {
  const out: string[] = []
  const push = (s: string) => {
    const v = s.trim()
    if (!v) return
    out.push(v)
  }
  for (const item of items) {
    if (item == null) continue
    if (Array.isArray(item)) {
      for (const v of item) {
        if (typeof v === 'string') {
          v.split(/[,;|/•#()\-\+]+/g).forEach(push)
        } else if (v != null) {
          push(String(v))
        }
      }
    } else if (typeof item === 'string') {
      item.split(/[,;|/•#()\-\+]+/g).forEach(push)
    } else {
      push(String(item))
    }
  }
  const seen = new Set<string>()
  const dedup: string[] = []
  for (const s of out) {
    const key = s.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      dedup.push(s)
    }
  }
  return dedup
}

function stripLocationSentences(text: string): string {
  if (!text) return text
  const sentences = text.split(/(?<=\.)\s+/)
  const filtered = sentences.filter(s => !/\b(location|commute|commutability|city|distance|relocat)/i.test(s))
  const out = filtered.join(' ').trim()
  return out || text
}

/* ====================== Small UI bits (local) ====================== */
function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-4xl w-[92vw] max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="font-semibold">{title}</div>
          <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>✕</button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  )
}

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
      <h3 className="font-semibold mb-3">AI Scored Candidates</h3>
      <ul className="divide-y">
        {rows.map(r => (
          <li key={r.candidateId} className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.candidateName}</div>
                {!!r.title && <div className="text-sm text-gray-600">{r.title}{r.location ? ` • ${r.location}` : ''}</div>}
                {r.linkedin && (
                  <a className="text-sm underline" href={r.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
                )}
                {r.matchedSkills && r.matchedSkills.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.matchedSkills.slice(0, 6).map(ms => (
                      <span key={ms} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 border">{ms}</span>
                    ))}
                  </div>
                )}
                {r.reason && (
                  <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.reason}</div>
                )}
              </div>

              <div className="text-right shrink-0 min-w-[200px]">
                <div className="flex items-baseline justify-end gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Suitability Score:</div>
                  <div className={`text-2xl font-semibold ${scoreColor(r.score)}`}>{r.score}%</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyId(r.candidateId)}
                  className="text-xs text-gray-600 mt-1"
                  title="Click to copy Candidate ID"
                >
                  ID: {r.candidateId}
                </button>
                {copied === r.candidateId && <div className="text-[10px] text-green-600 mt-1">Copied!</div>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ====================== Main Match Tab ====================== */
export default function MatchTab(): JSX.Element {
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobSummary | null>(null)
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [skillsText, setSkillsText] = useState('') // hidden, used internally for search
  const [qualsText, setQualsText] = useState('')  // hidden in UI, used for AI
  const [rawCands, setRawCands] = useState<CandidateRow[]>([])
  const [scored, setScored] = useState<ScoredRow[]>([])
  const [view, setView] = useState<'ai' | 'raw'>('raw')
  const [serverCount, setServerCount] = useState<number | null>(null)
  const [serverQuery, setServerQuery] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [aiPayload, setAiPayload] = useState<any>(null)

  // Fun messages for loading
  const funMessages = [
    'Zitko AI is thinking…',
    'Matching skills & qualifications…',
    'Cross-checking titles & keywords…',
    'Backstreet’s back, alright!',
  ]
  const [funIdx, setFunIdx] = useState(0)
  useEffect(() => {
    if (!loadingSearch) return
    setFunIdx(0)
    const id = setInterval(() => setFunIdx(i => (i + 1) % funMessages.length), 4000)
    return () => clearInterval(id)
  }, [loadingSearch])

  const retrieveJob = async (): Promise<JobSummary | null> => {
    if (!jobId) return null
    setScored([]); setRawCands([]); setServerCount(null); setServerQuery(null)
    try {
      const r = await fetch(`/api/vincere/position/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      const data = await r.json()

      const publicRaw = htmlToText(data?.public_description || data?.publicDescription || data?.description || '')
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
      // Update hidden skills state for searching but do not show
      setSkillsText(skillsArr.join(', '))
      setQualsText(qualsArr.join(', '))
      return summary
    } catch (e) {
      console.error(e)
      alert('Failed to retrieve or extract job details.')
      return null
    }
  }

  // NOTE: keep your existing runSearch implementation here
  const runSearch = async (_input?: { job: JobSummary; title: string; location: string; skillsText: string; qualsText: string }) => {
    // your existing search & scoring logic remains unchanged
  }

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

  // 🔁 Refresh: fully reset the form + results
  const handleRefresh = () => {
    setJobId('')
    setJob(null)
    setTitle('')
    setLocation('')
    setSkillsText('')
    setQualsText('')
    setRawCands([])
    setScored([])
    setServerCount(null)
    setServerQuery(null)
    setAiPayload(null)
    setView('raw')
    setLoadingAll(false)
    setLoadingSearch(false)
  }

  // 💾 Save: use UPDATED title/location when re-running the search
  const handleSave = async () => {
    const baseJob: JobSummary = {
      id: job?.id ?? (jobId || undefined),
      job_title: job?.job_title ?? title.trim(),
      location: job?.location ?? location.trim(),
      skills: job?.skills ?? (skillsText ? skillsText.split(',').map(s => s.trim()).filter(Boolean) : []),
      qualifications: job?.qualifications ?? (qualsText ? qualsText.split(',').map(s => s.trim()).filter(Boolean) : []),
      public_description: job?.public_description ?? '',
      internal_description: job?.internal_description ?? '',
      coords: job?.coords ?? null
    }

    const updated: JobSummary = {
      ...baseJob,
      job_title: title.trim(),
      location: location.trim()
    }

    setJob(updated)

    await runSearch({
      job: updated,
      title: updated.job_title || '',
      location: updated.location || '',
      skillsText,   // hidden; unchanged
      qualsText     // hidden; unchanged
    })
  }

  const statusText = loadingSearch
    ? funMessages[funIdx % funMessages.length]
    : (view === 'ai' ? 'Viewing AI scores' : 'Viewing raw results')
  const beforeScores = scored.length === 0

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left column: Job ID and Search */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p>Enter your Vincere Job ID to find matching candidates.</p>
              <button
                type="button"
                className="btn btn-grey text-sm"
                onClick={handleRefresh}
                title="Reset the form"
              >
                Refresh
              </button>
            </div>
            <div>
              <input
                className="input mt-1"
                placeholder="Job ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              />
            </div>
            <button
              className="btn btn-brand mt-4 w-full"
              onClick={retrieveSearchScore}
              disabled={loadingAll || !jobId}
            >
              {loadingAll ? 'Searching…' : 'Search'}
            </button>
          </div>

          {/* Right column: Job Title, Location, Save */}
          <div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm mb-2">
              <div>
                <input
                  className="input mt-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Job Title"
                />
              </div>
              <div>
                <input
                  className="input mt-1"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location"
                />
              </div>
            </div>
            <button
              className="btn btn-brand mt-4 w-full"
              onClick={handleSave}
              disabled={!job}
            >
              Save
            </button>
          </div>
        </div>

        <div className="h-px bg-gray-200 my-4" />

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button className={`btn ${view === 'raw' ? 'btn-brand' : 'btn-grey'} ${beforeScores ? 'opacity-50' : ''}`} onClick={() => setView('raw')} disabled={rawCands.length === 0}>
            Raw Candidates {rawCands.length ? `(${rawCands.length})` : ''}
          </button>
          <div className="flex items-center gap-2">
            <button className={`btn ${view === 'ai' ? 'btn-brand' : 'btn-grey'} ${beforeScores ? 'opacity-50' : ''}`} onClick={() => setView('ai')} disabled={scored.length === 0}>
              AI Scored {scored.length ? `(${scored.length})` : ''}
            </button>
            <span className="text-sm text-gray-600">{statusText}</span>
          </div>
          {serverQuery && <div className="ml-0 md:ml-4 text-xs text-gray-500">q: <code className="break-all">{serverQuery}</code></div>}
          <div className="ml-auto">
            <button className="btn btn-grey !px-3 !py-1 !text-xs !h-8 rounded-md" onClick={() => setShowJson(true)} disabled={!aiPayload}
              title={aiPayload ? 'Show the exact JSON sent to ChatGPT (location excluded from scoring)' : 'Run a search & scoring first'}>
              Show JSON
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {view === 'ai' ? (
          scored.length > 0
            ? <AIScoredList rows={scored} />
            : <div className="card p-6 text-sm text-gray-500">{loadingSearch ? funMessages[funIdx % funMessages.length] : 'No AI scores yet. Click "Search".'}</div>
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

      <Modal open={showJson} onClose={() => setShowJson(false)} title="JSON sent to ChatGPT">
        {!aiPayload ? (
          <div className="text-sm text-gray-500">No payload available yet. Run a search & scoring first.</div>
        ) : (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <button className="btn btn-grey" onClick={async () => {
                try { await navigator.clipboard.writeText(JSON.stringify(aiPayload, null, 2)); alert('Copied to clipboard') } catch {}
              }}>
                Copy to clipboard
              </button>
            </div>
            <pre className="rounded-2xl border p-4 text-xs overflow-auto max-h-[60vh]">
              {JSON.stringify(aiPayload, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  )
}

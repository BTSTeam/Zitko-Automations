// app/dashboard/page.tsx
'use client'
import { useState, useEffect, type Dispatch, type SetStateAction, type ReactNode } from 'react'

type TabKey = 'match' | 'source' | 'cv'
type SourceMode = 'candidates' | 'companies'

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
  matchedSkills?: string[]
  location?: string
}

/* ---------------- helpers ---------------- */
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
  return city
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-amber-600'
  return 'text-red-600'
}

// tiny normalizer/stemmer
function stem(s: string): string {
  const t = s.toLowerCase().replace(/[^a-z0-9+.#/ ]+/g, '').trim()
  return t.replace(/(ing|ed|es)\b/g, '').replace(/(\s{2,})/g, ' ').trim()
}

// Normalize any mix of arrays/strings/nulls into a flat, deduped string[]
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

// Keep non-location reasoning text
function stripLocationSentences(text: string): string {
  if (!text) return text
  const sentences = text.split(/(?<=\.)\s+/)
  const filtered = sentences.filter(s => !/\b(location|commute|commutability|city|distance|relocat)/i.test(s))
  const out = filtered.join(' ').trim()
  return out || text
}

/* ---------------- UI bits ---------------- */
function Tabs({
  tab, setTab, sourceMode, setSourceMode
}: {
  tab: TabKey
  setTab: Dispatch<SetStateAction<TabKey>>
  sourceMode: SourceMode
  setSourceMode: Dispatch<SetStateAction<SourceMode>>
}) {
  const [open, setOpen] = useState(false)

  // close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest?.('[data-sourcing-root]')) setOpen(false)
    }
    if (open) document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const Item = ({ id, children }: { id: Exclude<TabKey, 'source'>; children: ReactNode }) => (
    <button onClick={() => setTab(id)} className={`tab ${tab === id ? 'tab-active' : ''}`}>
      {children}
    </button>
  )

  return (
    <div className="flex gap-2 mb-6 justify-center">
      <Item id="match">Candidate Matching</Item>

      {/* Sourcing dropdown */}
      <div className="relative" data-sourcing-root>
        <button
          onClick={() => { setTab('source'); setOpen(v => !v) }}
          className={`tab ${tab === 'source' ? 'tab-active' : ''} flex items-center gap-1`}
          title="Sourcing"
        >
          Sourcing
          <span className="inline-block text-xs">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
            <button
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${sourceMode==='candidates' ? 'font-medium' : ''}`}
              onClick={() => { setSourceMode('candidates'); setTab('source'); setOpen(false) }}
            >
              Candidates
            </button>
            <button
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${sourceMode==='companies' ? 'font-medium' : ''}`}
              onClick={() => { setSourceMode('companies'); setTab('source'); setOpen(false) }}
            >
              Companies
            </button>
          </div>
        )}
      </div>

      <Item id="cv">CV Formatting</Item>
    </div>
  )
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
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

/** ---------- AI list ---------- */
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
/** -------------------------------- */

function MatchTab() {
  // ... (no changes to the matching logic)
  // ==== The entire MatchTab content remains exactly as in your last version ====
  // To keep this message focused, I'm leaving the full, working MatchTab
  // exactly as you pasted after our last edit (skills hidden, server count removed, etc).
  // --- BEGIN MATCHTAB (unchanged from previous message) ---
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

  const [serverCount, setServerCount] = useState<number | null>(null)
  const [serverQuery, setServerQuery] = useState<string | null>(null)

  const [showJson, setShowJson] = useState(false)
  const [aiPayload, setAiPayload] = useState<any>(null)

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
      const internalRaw = htmlToText(data?.internal_description || data?.internalDescription || data?.job_description || data?.description_internal || '')
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

  const runSearch = async (input?: { job: JobSummary; title: string; location: string; skillsText: string; qualsText: string }) => {
    const active = input ?? (job ? { job, title, location, skillsText, qualsText } : null)
    if (!active) return
    const { job: activeJob, title: t, location: loc, skillsText: skillsStr, qualsText: qualsStr } = active
    setLoadingSearch(true)
    setScored([]); setRawCands([]); setAiPayload(null); setServerCount(null); setServerQuery(null)
    try {
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
          limit: 500,
          debug: true
        })
      })
      const payload = await run.json()
      if (!run.ok) throw new Error(payload?.error || `Search failed (${run.status})`)
      const candidates = (() => {
        const raw = (payload?.results || []) as Array<any>
        const normalized = raw.map((c: any) => ({ ...c, id: String(c?.id ?? '').trim() }))
        const withIds = normalized.filter((c: any) => c.id.length > 0)
        const seen = new Set<string>()
        const dedup = withIds.filter((c: any) => {
          if (seen.has(c.id)) return false
          seen.add(c.id)
          return true
        })
        const dropped = raw.length - dedup.length
        if (dropped > 0) console.warn(`Dropped ${dropped} candidate(s) due to missing/duplicate IDs`)
        return dedup
      })()
      if (typeof payload?.count === 'number') setServerCount(payload.count)
      if (typeof payload?.query === 'string') setServerQuery(payload.query)
      const raw = candidates.map((c: any) => {
        const title = c.title || c.current_job_title || ''
        const location = extractCity(c.current_location_name || c.city || c.location || '')
        const skills = normalizeList(c.skills, c.skill, c.keywords)
        return { id: String(c.id), name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(), title, location, linkedin: (c.linkedinUrl ?? c.linkedin) ?? null, skills }
      })
      setRawCands(raw)
      setView('raw')
      const jobSkills = skillsStr.split(',').map(s => s.trim()).filter(Boolean)
      const jobSkillsStem = new Set(jobSkills.map(stem))
      const payloadToAI = {
        meta: { note: 'Candidates were pre-filtered by location in Vincere. Ignore location entirely when scoring.', location_filter_applied: true },
        job: { title: t, skills: jobSkills, qualifications: qualsStr.split(',').map(s => s.trim()).filter(Boolean), description: `${activeJob.public_description || ''}\n\n${activeJob.internal_description || ''}`.trim() },
        candidates: candidates.map((c: any) => {
          const candSkills = normalizeList(c.skills, c.skill, c.keywords)
          const candSkillsStem = candSkills.map(stem)
          const matchedSkills = candSkills.filter((s: string, i: number) => jobSkillsStem.has(candSkillsStem[i]))
          const title = c.title || c.current_job_title || ''
          return {
            candidate_id: String(c.id),
            full_name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || String(c.id),
            current_job_title: title,
            skills: candSkills,
            matched_skills: matchedSkills,
            qualifications: normalizeList(c.qualifications, c.edu_qualification, c.edu_degree, c.edu_course, c.edu_training, c.certifications)
          }
        })
      }
      setAiPayload(payloadToAI)
      const ai = await fetch('/api/ai/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadToAI) })
      const aiText = await ai.text()
      let outer: any = {}
      try { outer = JSON.parse(aiText) } catch {
        try { outer = JSON.parse((aiText || '').replace(/```json|```/g, '').trim()) } catch { outer = {} }
      }
      const rankedRaw = Array.isArray(outer?.ranked) ? outer.ranked : (() => {
        const content = outer?.choices?.[0]?.message?.content
        if (typeof content === 'string') {
          try {
            const cleaned = content.replace(/```json|```/g, '').trim()
            const p = JSON.parse(cleaned)
            return Array.isArray(p?.ranked) ? p.ranked : []
          } catch { return [] }
        }
        return []
      })()
      const byId = new Map(candidates.map((c: any) => [String(c.id), c]))
      const seenIds = new Set<string>()
      const ranked = rankedRaw
        .filter((r: any) => byId.has(String(r.candidate_id)))
        .filter((r: any) => { const id = String(r.candidate_id); if (seenIds.has(id)) return false; seenIds.add(id); return true })
      let scoredRows: ScoredRow[] = ranked.map((r: any) => {
        const scoreRaw = r.score_percent ?? r.score ?? r.score_pct ?? r.suitability_score ?? 0
        const s = Math.max(0, Math.min(100, Math.round(Number(scoreRaw) || 0)))
        const c = byId.get(String(r.candidate_id))
        const candidateName = c?.fullName || `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || String(r.candidate_id)
        const matchedSkills: string[] | undefined =
          Array.isArray(r?.matched_skills) ? r.matched_skills :
          Array.isArray((r?.details || {})?.matched_skills) ? (r.details.matched_skills) : undefined
        const locationCity = extractCity(c?.current_location_name || c?.city || c?.location || '') || loc
        return { candidateId: String(r.candidate_id), candidateName, score: s, reason: stripLocationSentences(String(r.reason || '')), linkedin: (c as any)?.linkedinUrl || (c as any)?.linkedin || undefined, title: c?.title || c?.current_job_title || '', matchedSkills, location: locationCity }
      })
      scoredRows = scoredRows.sort((a, b) => b.score - a.score)
      setScored(scoredRows)
      setView('ai')
    } catch (e) {
      console.error(e)
      alert('Search or scoring hit an issue. Showing raw candidates (if any).')
    } finally {
      setLoadingSearch(false)
    }
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

  const statusText = loadingSearch
    ? ['Zitko AI is thinking…','Matching skills & qualifications…','Cross-checking titles & keywords…'][funIdx % 3]
    : (view === 'ai' ? 'Viewing AI scores' : 'Viewing raw results')
  const beforeScores = scored.length === 0

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="mb-4">Enter your Vincere Job ID to find matching candidates.</p>
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
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-200 my-4" />

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button className={`btn ${view==='raw' ? 'btn-brand' : 'btn-grey'} ${beforeScores ? 'opacity-50' : ''}`} onClick={() => setView('raw')} disabled={rawCands.length === 0}>
            Raw Candidates {rawCands.length ? `(${rawCands.length})` : ''}
          </button>
          <div className="flex items-center gap-2">
            <button className={`btn ${view==='ai' ? 'btn-brand' : 'btn-grey'} ${beforeScores ? 'opacity-50' : ''}`} onClick={() => setView('ai')} disabled={scored.length === 0}>
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
                      {/* skills hidden for raw view */}
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
  // --- END MATCHTAB ---
}

function SourceTab({ mode }: { mode: SourceMode }) {
  if (mode === 'companies') {
    return (
      <div className="card p-6">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏗️</div>
          <h3 className="text-xl font-semibold mb-2">Building In Process…</h3>
          <p className="text-gray-600">This Companies sourcing page will host a similar embedded form soon.</p>
        </div>
      </div>
    )
  }

  // Candidates (existing JotForm embed)
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
        {hasUrl && <button className="btn btn-brand" onClick={refreshForm} title="Reload form">Refresh</button>}
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
  const [sourceMode, setSourceMode] = useState<SourceMode>('candidates') // default to Candidates

  return (
    <div>
      <Tabs tab={tab} setTab={setTab} sourceMode={sourceMode} setSourceMode={setSourceMode} />
      {tab==='match' && <MatchTab />}
      {tab==='source' && <SourceTab mode={sourceMode} />}
      {tab==='cv' && <CvTab />}
    </div>
  )
}

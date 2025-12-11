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

type ScoredRow = {
  candidateId: string
  candidateName: string
  score: number
  reason: string
  linkedin?: string
  title?: string
  current_employer?: string
  location?: string
  matchedSkills?: string[]
}

/* ====================== Helpers ====================== */

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

/* CLEAN JOB TITLE — YOUR RULES EXACTLY */
function cleanTitle(raw?: string): string {
  if (!raw) return ''
  const cleaned = raw.split(/[-|,–—]/)[0]?.trim() || ''
  return cleaned
}

/* CLEAN LOCATION — YOUR RULES EXACTLY */
function cleanLocation(raw?: string): string {
  if (!raw) return ''

  // Rule 1 — If "/" present: take before "/"
  if (raw.includes('/')) return raw.split('/')[0].trim()

  // Rule 2 — If "," present: take before first ","
  if (raw.includes(',')) return raw.split(',')[0].trim()

  // Rule 3 — Multi-word locations like “South East London” stay intact
  return raw.trim()
}

function LinkedInIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="#0A66C2" {...props}>
      <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1 4.98 2.12 4.98 3.5zM.5 8h4V24h-4V8zm7.5 0h3.8v2.2h.1c.5-1 1.7-2.2 3.6-2.2 3.8 0 4.5 2.5 4.5 5.7V24h-4v-8.2c0-2 0-4.5-2.7-4.5s-3.1 2.1-3.1 4.3V24h-4V8z"/>
    </svg>
  )
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
        } else if (v != null) push(String(v))
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
  const filtered = sentences.filter(s => !/\b(location|commute|city|distance|relocat)/i.test(s))
  const out = filtered.join(' ').trim()
  return out || text
}

/* ====================== Modal ====================== */

function Modal({ open, onClose, title, children }: {
  open: boolean, onClose: () => void, title: string, children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-4xl w-[92vw] max-height-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="font-semibold">{title}</div>
          <button className="text-gray-500 hover:text-gray-800" onClick={onClose}>✕</button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  )
}

/* ====================== Results List ====================== */

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
      <h3 className="font-semibold mb-3">Results</h3>
      <ul className="divide-y">

        {rows.map(r => (
          <li key={r.candidateId} className="py-4">
            <div className="flex items-start justify-between gap-4">
              
              {/* LEFT */}
              <div className="min-w-0">
                {/* Name */}
                <div className="font-medium truncate">{r.candidateName}</div>

                {/* Title + Employer */}
                {!!r.title && (
                  <div className="text-sm text-gray-600">
                    {r.title}{r.current_employer ? ` @ ${r.current_employer}` : ''}
                  </div>
                )}

                {/* Location */}
                {r.location && (
                  <div className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                    <span>📍</span>
                    <span>{r.location}</span>
                  </div>
                )}

                {/* Matched Skills */}
                {r.matchedSkills?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.matchedSkills.slice(0, 6).map(ms => (
                      <span key={ms} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 border">
                        {ms}
                      </span>
                    ))}
                  </div>
                )}

                {/* Reason */}
                {r.reason && (
                  <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                    {r.reason}
                  </div>
                )}
              </div>

              {/* RIGHT */}
              <div className="text-right shrink-0 min-w-[200px]">
                <div className="flex items-baseline justify-end gap-2">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">
                    Suitability Score:
                  </div>
                  <div className={`text-2xl font-semibold ${scoreColor(r.score)}`}>
                    {r.score}%
                  </div>
                </div>

                {/* ID copy button */}
                <button
                  type="button"
                  onClick={() => copyId(r.candidateId)}
                  className="text-xs text-gray-600 mt-1"
                  title="Click to copy Candidate ID"
                >
                  ID: {r.candidateId}
                </button>

                {copied === r.candidateId && (
                  <div className="text-[10px] text-green-600 mt-1">Copied!</div>
                )}

                {/* LinkedIn */}
                {r.linkedin && (
                  <a
                    href={r.linkedin}
                    target="_blank"
                    className="mt-2 inline-flex justify-end w-full"
                    title="View LinkedIn Profile"
                  >
                    <LinkedInIcon className="w-5 h-5" />
                  </a>
                )}

              </div>

            </div>
          </li>
        ))}

      </ul>
    </div>
  )
}

/* ====================== MAIN TAB ====================== */

export default function MatchTab(): JSX.Element {

  /* State */
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState<JobSummary | null>(null)

  const [loadingAll, setLoadingAll] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)

  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [qualsText, setQualsText] = useState('')

  const [scored, setScored] = useState<ScoredRow[]>([])
  const [serverCount, setServerCount] = useState<number | null>(null)
  const [serverQuery, setServerQuery] = useState<string | null>(null)

  const [showJson, setShowJson] = useState(false)
  const [aiPayload, setAiPayload] = useState<any>(null)

  /* Fun loading text */
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

  /* Reset */
  const resetAll = () => {
    setJobId('')
    setJob(null)
    setTitle('')
    setLocation('')
    setSkillsText('')
    setQualsText('')
    setScored([])
    setServerCount(null)
    setServerQuery(null)
    setAiPayload(null)
    setLoadingAll(false)
    setLoadingSearch(false)
  }

  /* Retrieve Job */
  const retrieveJob = async (): Promise<JobSummary | null> => {
    if (!jobId) return null

    setScored([])
    setServerCount(null)
    setServerQuery(null)

    try {
      const r = await fetch(`/api/vincere/position/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      const data = await r.json()

      const publicRaw = htmlToText(
        data?.public_description || data?.description || ''
      )
      const internalRaw = htmlToText(
        data?.internal_description ||
        data?.internalDescription ||
        data?.job_description ||
        data?.description_internal ||
        ''
      )

      const extractResp = await fetch('/api/job/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicDescription: publicRaw,
          internalDescription: internalRaw,
        }),
      })

      const extracted = await extractResp.json()

      const skillsArr = Array.isArray(extracted.skills) ? extracted.skills : []
      const qualsArr = Array.isArray(extracted.qualifications) ? extracted.qualifications : []

      const cleanedJobTitle = cleanTitle(String(data?.job_title || extracted?.title || '').trim())
      const cleanedLocation = cleanLocation(String(extracted?.location || data?.location || '').trim())

      const summary: JobSummary = {
        id: jobId,
        job_title: cleanedJobTitle,
        location: cleanedLocation,
        skills: skillsArr,
        qualifications: qualsArr,
        public_description: publicRaw,
        internal_description: internalRaw,
      }

      setJob(summary)
      setTitle(cleanedJobTitle)
      setLocation(cleanedLocation)
      setSkillsText(skillsArr.join(', '))
      setQualsText(qualsArr.join(', '))

      return summary
    } catch (e) {
      console.error(e)
      alert('Failed to retrieve job')
      return null
    }
  }

  /* Run Search */
  const runSearch = async (input?: {
    job: JobSummary
    title: string
    location: string
    skillsText: string
    qualsText: string
  }) => {
    const active = input ?? (job ? { job, title, location, skillsText, qualsText } : null)
    if (!active) return

    const { job: activeJob, title: t, location: loc, skillsText: s, qualsText: q } = active

    setLoadingSearch(true)
    setScored([])
    setAiPayload(null)
    setServerCount(null)
    setServerQuery(null)

    try {
      const run = await fetch('/api/match/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: {
            title: t,
            location: loc,
            skills: s.split(',').map(v => v.trim()).filter(Boolean),
            qualifications: q.split(',').map(v => v.trim()).filter(Boolean),
            description: activeJob.public_description || '',
          },
          limit: 500,
          debug: true,
        }),
      })

      const payload = await run.json()
      if (!run.ok) throw new Error(payload?.error || `Search failed (${run.status})`)

      const candidates = (() => {
        const raw = payload?.results || []
        const arr = raw.map((c: any) => ({ ...c, id: String(c?.id ?? '').trim() }))
        const seen = new Set<string>()
        return arr.filter(c => {
          if (!c.id) return false
          if (seen.has(c.id)) return false
          seen.add(c.id)
          return true
        })
      })()

      if (typeof payload?.count === 'number') setServerCount(payload.count)
      if (payload?.query) setServerQuery(JSON.stringify(payload.query))

      /* Build AI Payload */
      const jobSkills = s.split(',').map(v => v.trim()).filter(Boolean)
      const jobSkillsStem = new Set(jobSkills.map(stem))

      const toAI = {
        job: {
          title: t,
          skills: jobSkills,
          qualifications: q.split(',').map(v => v.trim()).filter(Boolean),
          description: `${activeJob.public_description || ''}\n\n${activeJob.internal_description || ''}`.trim(),
        },
        candidates: candidates.map((c: any) => {
          const candSkills = normalizeList(c.skills, c.skill, c.keywords)
          const candSkillsStem = candSkills.map(stem)
          const matched = candSkills.filter((s: string, i: number) => jobSkillsStem.has(candSkillsStem[i]))

          return {
            candidate_id: c.id,
            full_name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
            current_job_title: c.title || c.current_job_title || '',
            current_employer: c.current_employer || '',
            location: c.location || '',
            city: c.city || '',
            skills: candSkills,
            matched_skills: matched,
            qualifications: normalizeList(c.qualifications),
            education: {
              degree: normalizeList(c.edu_degree),
              course: normalizeList(c.edu_course),
              institution: normalizeList(c.edu_institution),
              training: normalizeList(c.edu_training),
            },
          }
        }),
      }

      setAiPayload(toAI)

      /* AI Scoring */
      const ai = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toAI),
      })

      const aiText = await ai.text()
      let outer: any = {}

      try { outer = JSON.parse(aiText) }
      catch {
        try { outer = JSON.parse(aiText.replace(/```json|```/g, '').trim()) }
        catch {}
      }

      // --- Extract ranked results from ANY AI format ---
      let rankedRaw: any[] = [];
      
      // Case 1: AI returned { ranked: [...] }
      if (Array.isArray(outer?.ranked)) {
        rankedRaw = outer.ranked;
      }
      
      // Case 2: AI returned a raw array: [ {...}, {...} ]
      else if (Array.isArray(outer)) {
        rankedRaw = outer;
      }
      
      // Case 3: OpenAI ChatCompletions → content JSON
      else if (outer?.choices?.[0]?.message?.content) {
        try {
          const raw = outer.choices[0].message.content
            .replace(/```json|```/g, '')
            .trim();
      
          const parsed = JSON.parse(raw);
      
          if (Array.isArray(parsed?.ranked)) rankedRaw = parsed.ranked;
          else if (Array.isArray(parsed)) rankedRaw = parsed;
        } catch (e) {
          console.error('Failed to parse OpenAI content JSON', e);
        }
      }

      /* Merge results */
      const byId = new Map<string, any>(candidates.map((c: any) => [String(c.id), c]))

      const final = rankedRaw
        .filter((r: any) => byId.has(String(r.candidate_id)))
        .map((r: any) => {
          const c = byId.get(String(r.candidate_id))
          const rawScore = Number(r.score_percent ?? r.score ?? 0)
          const score = Math.max(0, Math.min(100, Math.round(rawScore)))

          return {
            candidateId: String(r.candidate_id),
            candidateName: c?.fullName || `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim(),
            score,
            reason: stripLocationSentences(String(r.reason || '')),
            linkedin: c?.linkedin ?? undefined,
            title: c?.title || c?.current_job_title || '',
            current_employer: c?.current_employer || '',
            matchedSkills: r?.matched_skills,
            location: cleanLocation(c?.location || c?.city || ''),
          }
        })
        .sort((a, b) => b.score - a.score)

      setScored(final)

    } catch (err) {
      console.error(err)
      alert('Search or scoring error.')
    } finally {
      setLoadingSearch(false)
    }
  }

  /* Combined Retrieve + Search */
  const retrieveSearchScore = async () => {
    if (!jobId) return alert('Enter Job ID')
    setLoadingAll(true)
    try {
      const summary = await retrieveJob()
      if (!summary) return
      await runSearch({
        job: summary,
        title: summary.job_title || '',
        location: summary.location || '',
        skillsText: (summary.skills || []).join(', '),
        qualsText: (summary.qualifications || []).join(', '),
      })
    } finally {
      setLoadingAll(false)
    }
  }

  /* UI Status */
  const statusText = loadingSearch
    ? funMessages[funIdx % funMessages.length]
    : scored.length > 0
      ? 'Viewing results'
      : 'Waiting…'

  /* MAIN UI */
  return (
    <div className="grid gap-6">

      {/* SEARCH */}
      <div className="card p-6 relative">
        <div className="flex items-start justify-between gap-4">
          <p className="mb-4 font-medium">
            Enter your Vincere Job ID to find matching candidates.
          </p>
          <button className="text-gray-500 hover:text-gray-800" onClick={resetAll}>↻</button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">

          <input
            className="input"
            placeholder="Job ID"
            value={jobId}
            onChange={e => setJobId(e.target.value)}
          />

          <input
            className="input"
            placeholder="Job Title"
            value={title}
            onChange={e => setTitle(cleanTitle(e.target.value))}
          />

          <input
            className="input"
            placeholder="Location"
            value={location}
            onChange={e => setLocation(cleanLocation(e.target.value))}
          />

          <div className="md:col-span-3 flex flex-col sm:flex-row gap-3">
            <button
              className="btn btn-brand sm:flex-1"
              disabled={loadingAll || !jobId}
              onClick={retrieveSearchScore}
            >
              {loadingAll ? 'Searching…' : 'Search'}
            </button>

            <button
              className="btn btn-grey sm:flex-1"
              disabled={!job}
              onClick={() =>
                runSearch({
                  job: job!,
                  title,
                  location,
                  skillsText,
                  qualsText,
                })
              }
            >
              Save & Resend
            </button>
          </div>
        </div>

        <div className="h-px bg-gray-200 my-4" />

        <div className="mt-2 flex items-center gap-3">
          <span className="text-sm text-gray-600">{statusText}</span>
          <div className="ml-auto">
            <button
              className="btn btn-grey !px-3 !py-1 !text-xs !h-8 rounded-md"
              disabled={!aiPayload}
              onClick={() => setShowJson(true)}
            >
              Show JSON
            </button>
          </div>
        </div>

      </div>

      {/* RESULTS */}
      <div className="flex flex-col gap-3">
        {scored.length > 0
          ? <AIScoredList rows={scored} />
          : <div className="card p-6 text-sm text-gray-500">Results will appear here.</div>}
      </div>

      {/* JSON VIEWER */}
      <Modal open={showJson} onClose={() => setShowJson(false)} title="JSON sent to ChatGPT">
        {!aiPayload
          ? <div className="text-sm text-gray-500">No payload yet.</div>
          : (
            <>
              <button
                className="btn btn-grey mb-2"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(aiPayload, null, 2))
                    alert('Copied!')
                  } catch {}
                }}
              >
                Copy JSON
              </button>
              <pre className="rounded-2xl border p-4 text-xs overflow-auto max-h-[60vh]">
                {JSON.stringify(aiPayload, null, 2)}
              </pre>
            </>
          )}
      </Modal>
    </div>
  )
}

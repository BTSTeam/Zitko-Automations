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
  employer?: string
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

/* ====================== Modal ====================== */
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

/* ====================== RESULTS LIST ====================== */
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
              
              {/* LEFT SIDE */}
              <div className="min-w-0">
                {/* Name */}
                <div className="font-medium truncate">{r.candidateName}</div>

                {/* Title */}
                {r.title && (
                  <div className="text-sm text-gray-600">{r.title}</div>
                )}

                {/* Employer */}
                {r.employer && (
                  <div className="text-sm text-gray-600">{r.employer}</div>
                )}

                {/* Full Location */}
                {r.location && (
                  <div className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                    <span>📍</span>
                    <span>{r.location}</span>
                  </div>
                )}

                {/* LinkedIn */}
                {r.linkedin && (
                  <a className="text-sm underline mt-1 block" href={r.linkedin} target="_blank">
                    LinkedIn
                  </a>
                )}

                {/* Matched Skills */}
                {r.matchedSkills && r.matchedSkills.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.matchedSkills.slice(0, 6).map(ms => (
                      <span key={ms} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 border">{ms}</span>
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

              {/* RIGHT SIDE */}
              <div className="text-right shrink-0 min-w-[200px]">
                <div className="flex items-baseline justify-end gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">
                    Suitability Score:
                  </div>
                  <div className={`text-2xl font-semibold ${scoreColor(r.score)}`}>
                    {r.score}%
                  </div>
                </div>

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

  /* ------------------ State ------------------ */
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

  /* ------------------ Fun loading messages ------------------ */
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

  /* ------------------ Reset ------------------ */
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

  /* ------------------ Retrieve Job ------------------ */
  const retrieveJob = async (): Promise<JobSummary | null> => {
    if (!jobId) return null
    setScored([]); setServerCount(null); setServerQuery(null)

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

      const skillsArr = Array.isArray(extracted?.skills) ? extracted.skills : []
      const qualsArr = Array.isArray(extracted?.qualifications) ? extracted.qualifications : []

      const cleanedLocation = extractCity(String(extracted?.location || '').trim())

      const summary: JobSummary = {
        id: jobId,
        job_title: String(data?.job_title || extracted?.title || '').trim(),
        location: cleanedLocation,
        skills: skillsArr,
        qualifications: qualsArr,
        public_description: publicRaw,
        internal_description: internalRaw,
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

  /* ------------------ Run Search ------------------ */
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
    setScored([]); setAiPayload(null); setServerCount(null); setServerQuery(null)

    try {
      /* --- 1. SEARCH --- */
      const run = await fetch('/api/match/run', {
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
          limit: 500,
          debug: true
        })
      })

      const payload = await run.json()
      if (!run.ok) throw new Error(payload?.error || `Search failed (${run.status})`)

      const candidates = (() => {
        const raw = payload?.results || []
        const arr = raw.map((c: any) => ({ ...c, id: String(c?.id ?? '').trim() }))
        const seen = new Set<string>()
        return arr.filter((c: any) => {
          if (!c.id) return false
          if (seen.has(c.id)) return false
          seen.add(c.id)
          return true
        })
      })()

      if (typeof payload?.count === 'number') setServerCount(payload.count)
      if (payload?.query) setServerQuery(JSON.stringify(payload.query))

      /* --- 2. BUILD AI PAYLOAD --- */
      const jobSkills = skillsStr.split(',').map(s => s.trim()).filter(Boolean)
      const jobSkillsStem = new Set(jobSkills.map(stem))

      const payloadToAI = {
        job: {
          title: t,
          skills: jobSkills,
          qualifications: qualsStr.split(',').map(s => s.trim()).filter(Boolean),
          description: `${activeJob.public_description || ''}\n\n${activeJob.internal_description || ''}`.trim()
        },
        candidates: candidates.map((c: any) => {
          const candSkills = normalizeList(c.skills, c.skill, c.keywords)
          const candSkillsStem = candSkills.map(stem)
          const matchedSkills = candSkills.filter((s: string, i: number) => jobSkillsStem.has(candSkillsStem[i]))

          return {
            candidate_id: c.id,
            full_name: c.fullName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
            current_job_title: c.title || c.current_job_title || '',
            current_employer: c.current_employer || '',
            location: c.location || '',
            city: c.city || '',

            skills: candSkills,
            matched_skills: matchedSkills,

            qualifications: normalizeList(
              c.qualifications, c.edu_qualification, c.professional_qualification
            ),

            education: {
              degree: normalizeList(c.edu_degree),
              course: normalizeList(c.edu_course),
              institution: normalizeList(c.edu_institution),
              training: normalizeList(c.edu_training),
            }
          }
        })
      }

      setAiPayload(payloadToAI)

      /* --- 3. SEND TO AI --- */
      const ai = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToAI)
      })

      const aiText = await ai.text()
      let outer: any = {}

      try { outer = JSON.parse(aiText) }
      catch {
        try { outer = JSON.parse(aiText.replace(/```json|```/g, '').trim()) }
        catch {}
      }

      const rankedRaw =
        Array.isArray(outer?.ranked)
          ? outer.ranked
          : (() => {
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

      /* --- 4. MERGE BACK INTO FRONTEND STRUCTURE --- */
      const byId = new Map<string, any>(candidates.map((c: any) => [String(c.id), c]));

      const ranked = rankedRaw
        .filter((r: any) => byId.has(String(r.candidate_id)))
        .map((r: any) => {
          const c = byId.get(String(r.candidate_id)) as any;  // ← FIX HERE
      
          const scoreRaw = r.score_percent ?? r.score ?? r.score_pct ?? r.suitability_score ?? 0;
          const score = Math.max(0, Math.min(100, Math.round(Number(scoreRaw) || 0)));
      
          const candidateName =
            c?.fullName ||
            `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() ||
            String(r.candidate_id);
      
          return {
            candidateId: String(r.candidate_id),
            candidateName,
            score,
            reason: stripLocationSentences(String(r.reason || '')),
            linkedin: c?.linkedin ?? undefined,
            title: c?.title || c?.current_job_title || '',
            matchedSkills: r?.matched_skills,
            location: extractCity(c?.location || c?.city || '')
          };
        })
        .sort((a, b) => b.score - a.score);


      setScored(scoredRows)

    } catch (e) {
      console.error(e)
      alert('Search or scoring encountered an issue.')
    } finally {
      setLoadingSearch(false)
    }
  }

  /* ------------------ Retrieve + Score Shortcut ------------------ */
  const retrieveSearchScore = async () => {
    if (!jobId) return alert('Enter Job ID')
    setLoadingAll(true)

    try {
      const summary = await retrieveJob()
      if (!summary) return

      const t = summary.job_title || ''
      const loc = summary.location || ''
      const skillsStr = (summary.skills || []).join(', ')
      const qualsStr = (summary.qualifications || []).join(', ')

      await runSearch({
        job: summary,
        title: t,
        location: loc,
        skillsText: skillsStr,
        qualsText: qualsStr
      })
    } finally {
      setLoadingAll(false)
    }
  }

  /* ------------------ UI ------------------ */
  const statusText = loadingSearch
    ? funMessages[funIdx % funMessages.length]
    : scored.length > 0
      ? 'Viewing results'
      : 'Waiting…'

  return (
    <div className="grid gap-6">

      {/* Job Search Panel */}
      <div className="card p-6 relative">
        <div className="flex items-start justify-between gap-4">
          <p className="mb-4 font-medium">
            Enter your Vincere Job ID to find matching candidates.
          </p>
          <button
            type="button"
            className="text-gray-500 hover:text-gray-800"
            onClick={resetAll}
            title="Refresh & clear all fields"
          >
            ↻
          </button>
        </div>

        {/* Inputs */}
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
            onChange={e => setTitle(e.target.value)}
          />

          <input
            className="input"
            placeholder="Location"
            value={location}
            onChange={e => setLocation(e.target.value)}
          />

          <div className="md:col-span-3 flex flex-col sm:flex-row gap-3">
            <button
              className="btn btn-brand sm:flex-1"
              onClick={retrieveSearchScore}
              disabled={loadingAll || !jobId}
            >
              {loadingAll ? 'Searching…' : 'Search'}
            </button>

            <button
              className="btn btn-grey sm:flex-1"
              onClick={() => runSearch({
                job: job!,
                title,
                location,
                skillsText,
                qualsText
              })}
              disabled={!job}
            >
              Save & Resend
            </button>
          </div>
        </div>

        <div className="h-px bg-gray-200 my-4" />

        {/* Status */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">{statusText}</span>

          {serverQuery && (
            <div className="text-xs text-gray-500 ml-4">
              q: <code>{serverQuery}</code>
            </div>
          )}

          <div className="ml-auto">
            <button
              className="btn btn-grey !px-3 !py-1 !text-xs !h-8 rounded-md"
              onClick={() => setShowJson(true)}
              disabled={!aiPayload}
            >
              Show JSON
            </button>
          </div>
        </div>
      </div>

      {/* RESULTS */}
      <div className="flex flex-col gap-3">
        {scored.length > 0 ? (
          <AIScoredList rows={scored} />
        ) : (
          <div className="card p-6 text-sm text-gray-500">
            Results will appear here after you click <span className="font-medium">Search</span>.
          </div>
        )}
      </div>

      {/* JSON MODAL */}
      <Modal open={showJson} onClose={() => setShowJson(false)} title="JSON sent to ChatGPT">
        {!aiPayload ? (
          <div className="text-sm text-gray-500">No payload available yet.</div>
        ) : (
          <div>
            <div className="mb-2">
              <button
                className="btn btn-grey"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(aiPayload, null, 2))
                    alert('Copied to clipboard')
                  } catch {}
                }}
              >
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

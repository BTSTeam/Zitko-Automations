// app/dashboard/_match/MatchTab.tsx
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
  keywords?: string[]
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

/* ====================== Small UI bits ====================== */
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
  const [skillsText, setSkillsText] = useState('')
  const [qualsText, setQualsText] = useState('')
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

  // 🔹 UPDATED: Job retrieval now uses /api/vincere/jobsearch
  const retrieveJob = async (): Promise<JobSummary | null> => {
    if (!jobId) return null
    setScored([]); setRawCands([]); setServerCount(null); setServerQuery(null)
    try {
      const r = await fetch(`/api/vincere/jobsearch?id=${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'Failed to fetch job details')

      const publicRaw = htmlToText(data?.public_description || '')
      const internalRaw = htmlToText(data?.internal_description || '')
      const keywords = Array.isArray(data?.keywords) ? data.keywords : []

      const extractResp = await fetch('/api/job/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicDescription: publicRaw,
          internalDescription: internalRaw,
          keywords
        })
      })
      const extracted = await extractResp.json()

      const skillsArr = Array.isArray(extracted?.skills) ? extracted.skills : []
      const qualsArr = Array.isArray(extracted?.qualifications) ? extracted.qualifications : []
      const cleanedLocation = extractCity(String(extracted?.location || data?.location || '').trim())

      const summary: JobSummary = {
        id: jobId,
        job_title: String(extracted?.title || data?.job_title || '').trim(),
        location: cleanedLocation,
        skills: skillsArr,
        qualifications: qualsArr,
        public_description: publicRaw,
        internal_description: internalRaw,
        keywords,
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

  // rest of your MatchTab (runSearch, AI scoring, etc.) remains the same
  // ...
}

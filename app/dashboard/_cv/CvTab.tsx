// app/dashboard/_cv/CvTab.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'

type TemplateKey = 'permanent' | 'contract' | 'us'

type Employment = {
  title?: string
  company?: string
  start?: string
  end?: string
  description?: string
}

type Education = {
  institution?: string
  course?: string
  qualification?: string
  start?: string
  end?: string
  notes?: string
}

type CandidateCore = {
  id?: string
  name?: string
  location?: string
  profile?: string
  keySkills?: string[]
  additionalInformation?: string
}

type RetrieveResponse = {
  ok: boolean
  candidate?: CandidateCore
  work?: Employment[]
  education?: Education[]
  extra?: Record<string, any> | null
  raw?: Record<string, any> | null
  error?: string
}

type OpenState = {
  core: boolean
  profile: boolean
  skills: boolean
  work: boolean
  education: boolean
  extra: boolean
}

const initialOpen: OpenState = {
  core: true,
  profile: true,
  skills: true,
  work: true,
  education: true,
  extra: true,
}

export default function CvTab({ templateFromShell }: { templateFromShell?: TemplateKey }): JSX.Element {
  // ---------- UI state ----------
  const [template, setTemplate] = useState<TemplateKey | null>(templateFromShell ?? null)
  const [candidateId, setCandidateId] = useState<string>('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState<OpenState>(initialOpen)

  // ---------- Data state ----------
  const [core, setCore] = useState<CandidateCore | null>(null)
  const [work, setWork] = useState<Employment[]>([])
  const [education, setEducation] = useState<Education[]>([])
  const [extra, setExtra] = useState<Record<string, any> | null>(null)
  const [raw, setRaw] = useState<Record<string, any> | null>(null)

  // ---------- Helpers ----------
  function toggle(section: keyof OpenState) {
    setOpen(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const rawMini = useMemo(() => {
    if (!raw) return '{}'
    try {
      const text = JSON.stringify(raw, null, 2)
      // mini truncate for the Core Details block
      return text.length > 1200 ? text.slice(0, 1200) + '\n… (truncated)' : text
    } catch {
      return '{}'
    }
  }, [raw])

  async function tryFetch(url: string) {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(errText || `Fetch failed: ${res.status}`)
    }
    return res.json()
  }

  async function retrieve() {
    if (!candidateId?.trim()) {
      setError('Please enter a Candidate ID.')
      return
    }

    setLoading(true)
    setError(null)

    // clear old data to avoid confusion while loading
    setCore(null)
    setWork([])
    setEducation([])
    setExtra(null)
    setRaw(null)

    try {
      // 1) Preferred single endpoint you said you updated
      const combined: RetrieveResponse = await tryFetch(`/api/cv/retrieve?candidateId=${encodeURIComponent(candidateId)}`)

      // If combined ok – great. If not, fall back to Vincere endpoints you listed.
      if (!combined?.ok) {
        // Fallback path
        const [
          edu,
          exp,
          coreResp,
        ] = await Promise.allSettled([
          tryFetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}/educationdetails`),
          tryFetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}/workexperiences`),
          tryFetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}/core`), // assume you have a core route or put retrieve here again
        ])

        const coreFromFB =
          coreResp.status === 'fulfilled' ? (coreResp.value?.candidate ?? coreResp.value ?? null) : null
        const workFromFB =
          exp.status === 'fulfilled' ? (exp.value?.work ?? exp.value ?? []) : []
        const eduFromFB =
          edu.status === 'fulfilled' ? (edu.value?.education ?? edu.value ?? []) : []

        setCore(normalizeCore(coreFromFB))
        setWork(normalizeWork(workFromFB))
        setEducation(normalizeEducation(eduFromFB))
        setExtra(null)
        // raw: include whatever we collected in fallback
        setRaw({
          fallback: true,
          core: coreFromFB,
          work: workFromFB,
          education: eduFromFB,
        })

        // If all three failed, bubble the most relevant error
        if (coreResp.status === 'rejected' && exp.status === 'rejected' && edu.status === 'rejected') {
          throw new Error(
            [
              'Combined endpoint failed and all fallback endpoints failed.',
              `Core error: ${coreResp.reason instanceof Error ? coreResp.reason.message : String(coreResp.reason)}`,
              `Work error: ${exp.reason instanceof Error ? exp.reason.message : String(exp.reason)}`,
              `Edu error: ${edu.reason instanceof Error ? edu.reason.message : String(edu.reason)}`,
            ].join('\n'),
          )
        }
      } else {
        // Combined success
        setCore(normalizeCore(combined.candidate ?? null))
        setWork(normalizeWork(combined.work ?? []))
        setEducation(normalizeEducation(combined.education ?? []))
        setExtra(combined.extra ?? null)
        setRaw(combined.raw ?? {
          candidate: combined.candidate,
          work: combined.work,
          education: combined.education,
          extra: combined.extra,
        })
      }
    } catch (e: any) {
      setError(parseErr(e))
    } finally {
      setLoading(false)
    }
  }

  // ---------- Normalizers (defensive against varying API shapes) ----------
  function normalizeCore(input: any): CandidateCore | null {
    if (!input || typeof input !== 'object') return null
    const name = input.name ?? [input.first_name, input.last_name].filter(Boolean).join(' ') || undefined
    const keySkills: string[] =
      Array.isArray(input.keySkills) ? input.keySkills
        : Array.isArray(input.skills) ? input.skills
        : typeof input.keywords === 'string' ? splitSkills(input.keywords)
        : []

    return {
      id: String(input.id ?? input.candidate_id ?? ''),
      name,
      location: input.location ?? input.current_location_name ?? input.current_city ?? undefined,
      profile: input.profile ?? input.summary ?? input.about ?? undefined,
      keySkills,
      additionalInformation: input.additionalInformation ?? input.additional_info ?? input.notes ?? undefined,
    }
  }

  function splitSkills(s: string): string[] {
    return s
      .split(/[,;|]/g)
      .map(v => v.trim())
      .filter(Boolean)
  }

  function normalizeWork(arr: any): Employment[] {
    if (!Array.isArray(arr)) return []
    return arr.map((w: any) => ({
      title: w.title ?? w.job_title ?? w.position ?? undefined,
      company: w.company ?? w.company_name ?? undefined,
      start: toDateStr(w.start ?? w.start_date),
      end: toDateStr(w.end ?? w.end_date),
      description: w.description ?? w.responsibilities ?? undefined,
    }))
  }

  function normalizeEducation(arr: any): Education[] {
    if (!Array.isArray(arr)) return []
    return arr.map((e: any) => ({
      institution: e.institution ?? e.school ?? e.edu_institution ?? undefined,
      course: e.course ?? e.edu_course ?? undefined,
      qualification: e.qualification ?? e.edu_qualification ?? e.degree ?? undefined,
      start: toDateStr(e.start ?? e.start_date),
      end: toDateStr(e.end ?? e.end_date),
      notes: e.notes ?? undefined,
    }))
  }

  function toDateStr(d?: string): string | undefined {
    if (!d) return undefined
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return String(d)
    // Show Month YYYY if possible
    try {
      return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    } catch {
      return dt.toISOString().slice(0, 10)
    }
  }

  function parseErr(e: unknown): string {
    if (typeof e === 'string') return e
    if (e instanceof Error) return e.message
    try {
      return JSON.stringify(e)
    } catch {
      return 'Unknown error'
    }
  }

  // ---------- Small presentational helpers ----------
  const Section: React.FC<{ title: string; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({
    title,
    open,
    onToggle,
    children,
  }) => (
    <section
      className="rounded-xl border border-gray-200 bg-white shadow-sm mb-3 overflow-hidden"
      style={{ borderColor: '#e5e7eb' }}
    >
      <header
        onClick={onToggle}
        className="cursor-pointer select-none px-4 py-3 flex items-center justify-between bg-gray-50"
      >
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <span className="text-xs text-gray-500">{open ? '▼' : '►'}</span>
      </header>
      {open && <div className="px-4 py-3">{children}</div>}
    </section>
  )

  const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="text-xs font-medium text-gray-500">{children}</div>
  )

  const Value: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="text-sm text-gray-900">{children}</div>
  )

  // ---------- Render ----------
  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4 mb-4">
        <div className="flex-1">
          <Label>Template (optional)</Label>
          <select
            value={template ?? ''}
            onChange={(e) => setTemplate((e.target.value || null) as TemplateKey | null)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">— Select —</option>
            <option value="permanent">Permanent</option>
            <option value="contract">Contract</option>
            <option value="us">US</option>
          </select>
        </div>

        <div className="flex-1">
          <Label>Candidate ID</Label>
          <input
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            placeholder="e.g. 255472"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:pb-[2px]">
          <button
            onClick={retrieve}
            disabled={loading}
            className={`px-4 py-2 rounded-md text-sm font-semibold ${
              loading ? 'bg-gray-300 text-gray-600' : 'bg-black text-white hover:opacity-90'
            }`}
            title="Retrieve Candidate"
          >
            {loading ? 'Retrieving…' : 'Retrieve Candidate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {/* CORE DETAILS */}
      <Section title="Core Details" open={open.core} onToggle={() => toggle('core')}>
        {core ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Value>{core.name || '—'}</Value>
            </div>
            <div>
              <Label>Location</Label>
              <Value>{core.location || '—'}</Value>
            </div>
            <div className="sm:col-span-2">
              <Label>Candidate ID</Label>
              <Value>{core.id || '—'}</Value>
            </div>

            {/* Raw JSON (mini) requested under Core Details (very small) */}
            <div className="sm:col-span-2">
              <Label>Raw JSON (mini)</Label>
              <pre
                className="mt-1 rounded-md border bg-gray-50 overflow-auto p-2 text-[10px] leading-tight"
                style={{ maxHeight: 160 }}
              >
                {rawMini}
              </pre>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">No data yet. Enter an ID and retrieve.</div>
        )}
      </Section>

      {/* PROFILE */}
      <Section title="Profile" open={open.profile} onToggle={() => toggle('profile')}>
        <div className="prose prose-sm max-w-none">
          {core?.profile ? <p className="whitespace-pre-wrap">{core.profile}</p> : <p className="text-gray-500">—</p>}
        </div>
      </Section>

      {/* KEY SKILLS */}
      <Section title="Key Skills" open={open.skills} onToggle={() => toggle('skills')}>
        {core?.keySkills?.length ? (
          <div className="flex flex-wrap gap-2">
            {core.keySkills.map((s, i) => (
              <span key={`${s}-${i}`} className="text-xs bg-gray-100 border border-gray-200 rounded-full px-2 py-1">
                {s}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">—</div>
        )}
      </Section>

      {/* EMPLOYMENT HISTORY */}
      <Section title="Employment History" open={open.work} onToggle={() => toggle('work')}>
        {work?.length ? (
          <ul className="space-y-3">
            {work.map((w, idx) => (
              <li key={idx} className="rounded-md border border-gray-200 p-3">
                <div className="text-sm font-semibold">{w.title || '—'}</div>
                <div className="text-xs text-gray-600">{w.company || '—'}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {[w.start, w.end].filter(Boolean).join(' — ') || 'Dates not provided'}
                </div>
                {w.description && (
                  <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{w.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500">—</div>
        )}
      </Section>

      {/* EDUCATION & QUALIFICATIONS */}
      <Section title="Education & Qualifications" open={open.education} onToggle={() => toggle('education')}>
        {education?.length ? (
          <ul className="space-y-3">
            {education.map((e, idx) => (
              <li key={idx} className="rounded-md border border-gray-200 p-3">
                <div className="text-sm font-semibold">{e.institution || '—'}</div>
                <div className="text-xs text-gray-600">
                  {[e.qualification, e.course].filter(Boolean).join(' • ') || '—'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {[e.start, e.end].filter(Boolean).join(' — ') || 'Dates not provided'}
                </div>
                {e.notes && <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{e.notes}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500">—</div>
        )}
      </Section>

      {/* ADDITIONAL INFORMATION */}
      <Section title="Additional Information" open={open.extra} onToggle={() => toggle('extra')}>
        <div className="space-y-3">
          <div>
            <Label>Notes / Additional</Label>
            <div className="text-sm text-gray-900 whitespace-pre-wrap">
              {core?.additionalInformation || '—'}
            </div>
          </div>

          {/* FULL Raw JSON requested at the very bottom under Additional Information */}
          <div>
            <Label>Raw JSON (full, highlighted)</Label>
            <div className="mt-2 rounded-md border border-gray-200 overflow-hidden">
              <pre className="m-0 p-3 text-[11px] leading-snug overflow-auto bg-[#0b1021] text-[#cdd9e5]">
                {raw ? syntaxHighlightJSON(raw) : '// No raw data'}
              </pre>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}

/** Lightweight client-side JSON highlighter (no deps) */
function syntaxHighlightJSON(obj: unknown): string {
  let json: string
  try {
    json = JSON.stringify(obj, null, 2)
  } catch {
    json = String(obj)
  }
  // escape HTML
  json = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return json.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-[#9cdcfe]' // string by default
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-[#c586c0]' // key
        } else {
          cls = 'text-[#ce9178]' // string value
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-[#4fc1ff]' // boolean
      } else if (/null/.test(match)) {
        cls = 'text-[#dcdcaa]' // null
      } else {
        cls = 'text-[#b5cea8]' // number
      }
      return `<span style="color:${cls.slice(6, -2)}">${match}</span>`
    },
  )
}

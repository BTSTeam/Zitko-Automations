'use client'

import { useEffect, useState } from 'react'

type TemplateKey = 'permanent' | 'contract' | 'us'

type Employment = {
  title?: string
  company?: string
  start?: string
  end?: string
  description?: string
}

type OpenState = {
  core: boolean
  profile: boolean
  skills: boolean
  work: boolean
  education: boolean
  extra: boolean
}

export default function CvTab({ templateFromShell }: { templateFromShell?: TemplateKey }): JSX.Element {
  // ========== UI state ==========
  const [template, setTemplate] = useState<TemplateKey | null>(templateFromShell ?? null)
  const [candidateId, setCandidateId] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Raw fetched (debug)
  const [rawCandidate, setRawCandidate] = useState<any>(null)
  const [rawWork, setRawWork] = useState<any[]>([])
  const [rawMatch, setRawMatch] = useState<any>(null)
  const [rawEdu, setRawEdu] = useState<any[]>([]) // <-- NEW

  // Form that drives preview
  const [form, setForm] = useState<{
    name: string
    location: string
    profile: string
    keySkills: string
    employment: Employment[]
    education: string
    additional: {
      drivingLicense: string
      nationality: string
      availability: string
      health: string
      criminalRecord: string
      financialHistory: string
    }
  }>(getEmptyForm())

  const [open, setOpen] = useState<OpenState>({
    core: true,
    profile: true,
    skills: true,
    work: true,
    education: false,
    extra: false,
  })

  function getEmptyForm() {
    return {
      name: '',
      location: '',
      profile: '',
      keySkills: '',
      employment: [],
      education: '',
      additional: {
        drivingLicense: '',
        nationality: '',
        availability: '',
        health: '',
        criminalRecord: '',
        financialHistory: '',
      },
    }
  }

  function resetAllForTemplate(t: TemplateKey | null) {
    setTemplate(t)
    setForm(getEmptyForm())
    setRawCandidate(null)
    setRawWork([])
    setRawMatch(null)
    setRawEdu([]) // <-- NEW
    setError(null)
  }

  // Keep component in sync with the header dropdown (if present)
  useEffect(() => {
    if (templateFromShell) {
      resetAllForTemplate(templateFromShell)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateFromShell])

  function toggle(k: keyof OpenState) {
    setOpen(s => ({ ...s, [k]: !s[k] }))
  }

  // ========== helpers ==========
  function safeJoin(arr?: any[], sep = ', '): string {
    if (!Array.isArray(arr)) return ''
    return arr.map(v => (v == null ? '' : String(v))).filter(Boolean).join(sep)
  }

  function toName(c: any): string {
    const first = c?.first_name ?? c?.firstName ?? ''
    const last = c?.last_name ?? c?.lastName ?? ''
    const fallback = c?.full_name ?? c?.name ?? ''
    return `${first} ${last}`.trim() || fallback || ''
  }

  function toLocation(c: any): string {
    return c?.current_location_name || c?.location || ''
  }

  function toSkills(c: any): string {
    // Prefer structured skills if present
    const skillsFromArrays =
      (Array.isArray(c?.skill) ? c.skill : []) ||
      (Array.isArray(c?.skills) ? c.skills : [])

    const keywordsFromString =
      typeof c?.keywords === 'string' ? c.keywords.split(',') : []

    const keywordsFromArray =
      Array.isArray(c?.keywords) ? c.keywords : []

    const merged = [
      ...skillsFromArrays,
      ...keywordsFromString,
      ...keywordsFromArray,
    ]

    const uniq = Array.from(new Set(merged.map((s) => String(s).trim()).filter(Boolean)))
    return safeJoin(uniq, ', ')
  }

  // Build Education & Qualifications text block from common Vincere fields (fallback)
  function toEducation(c: any): string {
    const qualifications = arrify(c?.edu_qualification)
    const degrees = arrify(c?.edu_degree)
    const courses = arrify(c?.edu_course)
    const institutions = arrify(c?.edu_institution)
    const trainings = arrify(c?.edu_training)

    const lines: string[] = []
    const maxLen = Math.max(qualifications.length, degrees.length, courses.length, institutions.length)
    for (let i = 0; i < maxLen; i++) {
      const parts = [
        qualifications[i] || degrees[i] || courses[i] || '',
        institutions[i] || '',
      ].filter(Boolean)
      if (parts.length) lines.push(parts.join(' — '))
    }
    trainings.forEach(t => lines.push(String(t)))
    if (lines.length === 0) return ''
    return lines.join('\n')
  }

  function arrify(v: any): any[] {
    if (Array.isArray(v)) return v
    if (v == null) return []
    return [v]
  }

  function mapWorkExperiences(list: any[]): Employment[] {
    if (!Array.isArray(list)) return []
    return list.map(w => ({
      title: w?.title || w?.job_title || '',
      company: w?.company || w?.company_name || '',
      start: (w?.start_date || w?.startDate || '').toString(),
      end: (w?.end_date || w?.endDate || '').toString(),
      description: (w?.description || w?.duties || '').toString(),
    }))
  }

  // NEW: format MM/YYYY from a date-like string
  function formatDate(dateStr?: string | null): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }

  // NEW: Turn educationdetails array into lines of text
  function educationDetailsToText(list: any[]): string {
    if (!Array.isArray(list) || list.length === 0) return ''
    // Try common keys; we’ll refine once you confirm exact JSON
    return list.map(e => {
      const qual = e?.qualification || e?.course || e?.degree || ''
      const inst = e?.institution || e?.school || ''
      const start = formatDate(e?.start_date || e?.startDate)
      const end = e?.end_date || e?.endDate ? formatDate(e?.end_date || e?.endDate) : 'Present'
      const left = [qual, inst].filter(Boolean).join(' — ')
      const right = [start, end].filter(Boolean).join(' — ')
      return right ? `${left} (${right})` : left
    }).filter(Boolean).join('\n')
  }

  function onTemplatePick(t: TemplateKey) {
    if (templateFromShell) return
    resetAllForTemplate(t)
  }

  function setField(path: string, value: any) {
    setForm(prev => {
      const next: any = { ...prev }
      if (path.includes('.')) {
        const [a, b] = path.split('.', 2)
        next[a] = { ...next[a], [b]: value }
      } else {
        next[path] = value
      }
      return next
    })
  }

  // ========== data fetch ==========
  async function fetchData() {
    if (!candidateId) return
    if (!template) {
      alert('Please select a template first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const matchUrl = `/api/match/search?candidateId=${encodeURIComponent(candidateId)}`
      const [candResp, workResp, eduResp, matchResp] = await Promise.all([
        fetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}`, { cache: 'no-store' }),
        fetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}/workexperiences`, { cache: 'no-store' }),
        fetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}/educationdetails`, { cache: 'no-store' }), // <-- NEW
        fetch(matchUrl, { cache: 'no-store' }).catch(() => undefined) as any,
      ])

      if (!candResp.ok) throw new Error(await candResp.text())
      if (!workResp.ok) throw new Error(await workResp.text())
      if (!eduResp.ok) throw new Error(await eduResp.text())

      const cand = await candResp.json()
      const work = await workResp.json()
      const edu = await eduResp.json()

      const workArr: any[] = Array.isArray(work?.data) ? work.data : Array.isArray(work) ? work : []
      const eduArr: any[] = Array.isArray(edu?.data) ? edu.data : Array.isArray(edu) ? edu : []

      let matchJson: any = null
      if (matchResp && matchResp.ok) {
        try { matchJson = await matchResp.json() } catch { /* ignore */ }
      }

      setRawCandidate(cand)
      setRawWork(workArr)
      setRawEdu(eduArr)      // <-- NEW
      setRawMatch(matchJson)

      const mappedWork = mapWorkExperiences(workArr)

      const skillsFromMatch = Array.isArray(matchJson?.skills) ? matchJson.skills : null
      const educationTextFromMatch =
        typeof matchJson?.educationText === 'string' ? matchJson.educationText : null

      // Prefer explicit educationdetails; fall back to match; then candidate fields
      const educationTextFromEdu = educationDetailsToText(eduArr)
      const mergedEducation = educationTextFromEdu || educationTextFromMatch || toEducation(cand) || ''

      const mergedSkills = skillsFromMatch?.length
        ? skillsFromMatch.join(', ')
        : (toSkills(cand) || '')

      setForm(prev => ({
        ...prev,
        name: toName(cand) || prev.name,
        location: toLocation(cand) || prev.location,
        profile: cand?.summary || cand?.profile || prev.profile,
        keySkills: prev.keySkills || mergedSkills,
        employment: mappedWork.length ? mappedWork : prev.employment,
        education: prev.education || mergedEducation,
      }))
    } catch (e: any) {
      setError(e?.message || 'Failed to retrieve data')
    } finally {
      setLoading(false)
    }
  }

  // ========== preview (right) ==========
  function CVTemplatePreview(): JSX.Element {
    if (!template) {
      return (
        <div className="h-full grid place-items-center text-gray-500">
          <div className="text-center">
            <div className="text-lg font-medium">Select a template to preview</div>
            <div className="text-sm">Permanent (Contract/US in progress)</div>
          </div>
        </div>
      )
    }

    const Header = ({ title }: { title: string }) => (
      <h2 className="text-base font-semibold text-[#F7941D] mt-6 mb-2">{title}</h2>
    )

    const EmploymentBlock = (): JSX.Element => (
      <div className="space-y-3">
        {form.employment.length === 0 ? (
          <div className="text-gray-500 text-sm">No employment history yet.</div>
        ) : (
          form.employment.map((e, i) => (
            <div key={i}>
              <div className="font-medium">
                {e.title || 'Role'}
                {e.company ? ` · ${e.company}` : ''}
              </div>
              <div className="text-xs text-gray-500">{[e.start, e.end].filter(Boolean).join(' — ')}</div>
              {e.description && <div className="text-sm mt-1 whitespace-pre-wrap">{e.description}</div>}
            </div>
          ))
        )}
      </div>
    )

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Curriculum Vitae</h1>
            <div className="text-sm text-gray-700">
              {form.name || 'Name'}{form.location ? ` · ${form.location}` : ''}
            </div>
          </div>
          <img src="/Zitko_Logo-removebg-preview.png" alt="Zitko" className="h-8" />
        </div>

        <div className="text-xs text-gray-500 italic mb-4">
          {template === 'permanent' && 'Permanent Template'}
          {template === 'contract' && 'Contract Template'}
          {template === 'us' && 'US Template'}
        </div>

        <Header title="Profile" />
        <div className="whitespace-pre-wrap">{form.profile || '—'}</div>

        <Header title="Key Skills" />
        <div className="whitespace-pre-wrap">
          {(form.keySkills || '')
            .split(/\r?\n|,\s*/)
            .filter(Boolean)
            .map((s, i) => <div key={i}>• {s}</div>)}
        </div>

        <Header title="Employment History" />
        <EmploymentBlock />

        <Header title="Education & Qualifications" />
        <div className="whitespace-pre-wrap">{form.education || '—'}</div>

        <Header title="Additional Information" />
        <div className="text-sm grid gap-1">
          <div>Driving License: {form.additional.drivingLicense || '—'}</div>
          <div>Nationality: {form.additional.nationality || '—'}</div>
          <div>Availability: {form.additional.availability || '—'}</div>
          <div>Health: {form.additional.health || '—'}</div>
          <div>Criminal Record: {form.additional.criminalRecord || '—'}</div>
          <div>Financial History: {form.additional.financialHistory || '—'}</div>
        </div>
      </div>
    )
  }

  // ========== left collapsible section wrapper ==========
  function Section({
    title, open, onToggle, children
  }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }): JSX.Element {
    return (
      <div className="rounded-2xl border overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between"
        >
          <span className="font-medium">{title}</span>
          <span className="text-gray-500">{open ? '−' : '+'}</span>
        </button>
        {open && <div className="p-4 space-y-3">{children}</div>}
      </div>
    )
  }

  // ========== render ==========
  return (
    <div className="grid gap-4">
      {/* Template picker + fetch */}
      <div className="card p-4">
        {/* Hide local picker if parent controls the template via header dropdown */}
        {!templateFromShell && (
          <div className="grid sm:grid-cols-3 gap-2">
            {(['permanent', 'contract', 'us'] as TemplateKey[]).map(t =>
              t === 'permanent' ? (
                // Permanent template remains selectable
                <button
                  key={t}
                  type="button"
                  onClick={() => onTemplatePick(t)}
                  className={`btn w-full ${template === t ? 'btn-brand' : 'btn-grey'}`}
                  title="Use Permanent template"
                >
                  Permanent
                </button>
              ) : (
                // Contract and US templates show a placeholder message
                <div
                  key={t}
                  className="btn w-full btn-grey opacity-50 cursor-not-allowed flex items-center justify-center"
                  title="Template in progress"
                >
                  {t === 'contract' ? 'Contract' : 'US'} – Building in progress…
                </div>
              )
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-[1fr_auto] gap-2 mt-4">
          <input
            className="input"
            placeholder="Enter Candidate ID"
            value={candidateId}
            onChange={e => setCandidateId(e.target.value)}
          />
          <button className="btn btn-brand" onClick={fetchData} disabled={loading || !candidateId}>
            {loading ? 'Fetching…' : 'Retrieve Candidate'}
          </button>
        </div>
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </div>

      {/* Split layout */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* LEFT editor */}
        <div className="grid gap-4">
          <Section title="Core Details" open={open.core} onToggle={() => toggle('core')}>
            <div>
              <label className="text-sm text-gray-600">Name</label>
              <input className="input mt-1" value={form.name} onChange={e => setField('name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600">Location</label>
              <input className="input mt-1" value={form.location} onChange={e => setField('location', e.target.value)} />
            </div>
          </Section>

          <Section title="Profile" open={open.profile} onToggle={() => toggle('profile')}>
            <textarea className="input h-28" value={form.profile} onChange={e => setField('profile', e.target.value)} />
          </Section>

          <Section title="Key Skills" open={open.skills} onToggle={() => toggle('skills')}>
            <textarea
              className="input h-28"
              placeholder="One per line or comma-separated"
              value={form.keySkills}
              onChange={e => setField('keySkills', e.target.value)}
            />
          </Section>

          <Section title="Employment History" open={open.work} onToggle={() => toggle('work')}>
            <div className="space-y-4">
              {form.employment.map((e, i) => (
                <div key={i} className="rounded-xl border p-3 grid gap-2">
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input
                      className="input" placeholder="Title" value={e.title || ''}
                      onChange={ev => {
                        const v = ev.target.value
                        setForm(prev => {
                          const employment = [...prev.employment]
                          employment[i] = { ...employment[i], title: v }
                          return { ...prev, employment }
                        })
                      }}
                    />
                    <input
                      className="input" placeholder="Company" value={e.company || ''}
                      onChange={ev => {
                        const v = ev.target.value
                        setForm(prev => {
                          const employment = [...prev.employment]
                          employment[i] = { ...employment[i], company: v }
                          return { ...prev, employment }
                        })
                      }}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input
                      className="input" placeholder="Start" value={e.start || ''}
                      onChange={ev => {
                        const v = ev.target.value
                        setForm(prev => {
                          const employment = [...prev.employment]
                          employment[i] = { ...employment[i], start: v }
                          return { ...prev, employment }
                        })
                      }}
                    />
                    <input
                      className="input" placeholder="End" value={e.end || ''}
                      onChange={ev => {
                        const v = ev.target.value
                        setForm(prev => {
                          const employment = [...prev.employment]
                          employment[i] = { ...prev.employment[i], end: v }
                          return { ...prev, employment }
                        })
                      }}
                    />
                  </div>
                  <textarea
                    className="input h-24" placeholder="Description" value={e.description || ''}
                    onChange={ev => {
                      const v = ev.target.value
                      setForm(prev => {
                        const employment = [...prev.employment]
                        employment[i] = { ...prev.employment[i], description: v }
                        return { ...prev, employment }
                      })
                    }}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-grey"
                  onClick={() => setForm(prev => ({ ...prev, employment: [...prev.employment, {}] }))}
                >
                  + Add role
                </button>
                {form.employment.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-grey"
                    onClick={() => setForm(prev => ({ ...prev, employment: prev.employment.slice(0, -1) }))}
                  >
                    Remove last
                  </button>
                )}
              </div>
            </div>
          </Section>

          <Section title="Education & Qualifications" open={open.education} onToggle={() => toggle('education')}>
            <textarea className="input h-24" value={form.education} onChange={e => setField('education', e.target.value)} />
          </Section>

          <Section title="Additional Information" open={open.extra} onToggle

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

type Education = {
  course?: string
  institution?: string
  start?: string
  end?: string
}

type OpenState = {
  core: boolean
  profile: boolean
  skills: boolean
  work: boolean
  education: boolean
  extra: boolean
  raw: boolean
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
  const [rawEdu, setRawEdu] = useState<any[]>([])

  // Form that drives preview
  const [form, setForm] = useState<{
    name: string
    location: string
    profile: string
    keySkills: string
    employment: Employment[]
    education: Education[]
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
    education: true,
    extra: true,
    raw: false,
  })

  function getEmptyForm() {
    return {
      name: '',
      location: '',
      profile: '',
      keySkills: '',
      employment: [],
      education: [],
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
    setRawEdu([])
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
  function formatDate(dateStr?: string | null): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }

  function mapWorkExperiences(list: any[]): Employment[] {
    if (!Array.isArray(list)) return []
    return list.map(w => ({
      title: w?.title || w?.job_title || '',
      company: w?.company || w?.company_name || '',
      start: w?.start ? formatDate(w.start) : (w?.work_from ? formatDate(w.work_from) : (w?.start_date ? formatDate(w.start_date) : '')),
      end: w?.end ? (w.end ? formatDate(w.end) : 'Present') : (w?.work_to ? formatDate(w.work_to) : (w?.end_date ? formatDate(w.end_date) : 'Present')),
      description: w?.description || '',
    }))
  }

  function mapEducation(list: any[]): Education[] {
    if (!Array.isArray(list)) return []
    return list.map(e => ({
      course: e?.course || e?.degree || e?.qualification || '',
      institution: e?.institution || e?.school || '',
      start: e?.start ? formatDate(e.start) : (e?.start_date ? formatDate(e.start_date) : (e?.from_date ? formatDate(e.from_date) : '')),
      end: e?.end ? (e.end ? formatDate(e.end) : 'Present') : (e?.end_date ? formatDate(e.end_date) : (e?.to_date ? formatDate(e.to_date) : 'Present')),
    }))
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

  function setEmployment(index: number, key: keyof Employment, value: string) {
    setForm(prev => {
      const list = [...prev.employment]
      list[index] = { ...list[index], [key]: value }
      return { ...prev, employment: list }
    })
  }

  function addEmployment() {
    setForm(prev => ({ ...prev, employment: [...prev.employment, { title: '', company: '', start: '', end: '', description: '' }] }))
  }

  function removeEmployment(index: number) {
    setForm(prev => ({ ...prev, employment: prev.employment.filter((_, i) => i !== index) }))
  }

  function setEducation(index: number, key: keyof Education, value: string) {
    setForm(prev => {
      const list = [...prev.education]
      list[index] = { ...list[index], [key]: value }
      return { ...prev, education: list }
    })
  }

  function addEducation() {
    setForm(prev => ({ ...prev, education: [...prev.education, { course: '', institution: '', start: '', end: '' }] }))
  }

  function removeEducation(index: number) {
    setForm(prev => ({ ...prev, education: prev.education.filter((_, i) => i !== index) }))
  }

  // ========== data fetch (single server call) ==========
  async function fetchData() {
    if (!candidateId) return
    if (!template) {
      alert('Please select a template first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cv/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: String(candidateId).trim() }),
      })
      const data = await res.json()

      if (!res.ok || !data?.ok) {
        if (res.status === 401) throw new Error('Not connected to Vincere. Please log in again.')
        if (res.status === 404) throw new Error(data?.error || `Candidate ${candidateId} not found in this tenant.`)
        throw new Error(data?.error || 'Failed to retrieve candidate.')
      }

      // Raw (debug)
      setRawCandidate(data?.raw?.candidate ?? null)
      const workArr: any[] = Array.isArray(data?.raw?.work?.data) ? data.raw.work.data : (Array.isArray(data?.raw?.work) ? data.raw.work : [])
      const eduArr: any[] = Array.isArray(data?.raw?.education?.data) ? data.raw.education.data : (Array.isArray(data?.raw?.education) ? data.raw.education : [])
      setRawWork(workArr)
      setRawEdu(eduArr)

      const c = data?.candidate ?? {}
      setForm(prev => ({
        ...prev,
        name: c?.name || prev.name,
        location: c?.location || prev.location,
        profile: c?.profile || prev.profile,
        keySkills: Array.isArray(c?.skills) ? c.skills.join(', ') : (c?.skills || prev.keySkills || ''),
        employment: mapWorkExperiences(Array.isArray(c?.work) ? c.work : workArr),
        education: mapEducation(Array.isArray(c?.education) ? c.education : eduArr),
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
            <div key={i} className="flex justify-between">
              <div>
                <div className="font-medium">{e.title || 'Role'}</div>
                <div className="text-xs text-gray-500">{e.company}</div>
              </div>
              <div className="text-xs text-gray-500 whitespace-nowrap">
                {e.start} — {e.end}
              </div>
            </div>
          ))
        )}
      </div>
    )

    const EducationBlock = (): JSX.Element => (
      <div className="space-y-3">
        {form.education.length === 0 ? (
          <div className="text-gray-500 text-sm">No education history yet.</div>
        ) : (
          form.education.map((e, i) => (
            <div key={i} className="flex justify-between">
              <div>
                <div className="font-medium">{e.course || 'Course'}</div>
                <div className="text-xs text-gray-500">{e.institution}</div>
              </div>
              <div className="text-xs text-gray-500 whitespace-nowrap">
                {e.start} — {e.end}
              </div>
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
        <EducationBlock />

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

  // ========== render ==========
  return (
    <div className="grid gap-4">
      <div className="card p-4">
        {!templateFromShell && (
          <div className="grid sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => resetAllForTemplate('permanent')}
              className={`btn w-full ${template === 'permanent' ? 'btn-brand' : 'btn-grey'}`}
            >
              Permanent
            </button>
            <div className="btn w-full btn-grey opacity-50 cursor-not-allowed flex items-center justify-center">
              Contract – Building in progress…
            </div>
            <div className="btn w-full btn-grey opacity-50 cursor-not-allowed flex items-center justify-center">
              US – Building in progress…
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-[1fr_auto] gap-2 mt-4">
          <input
            className="input"
            placeholder="Enter Candidate ID"
            value={candidateId}
            onChange={e => setCandidateId(e.target.value)}
            disabled={loading}
            autoComplete="off"
          />
          <button
            className="btn btn-brand"
            onClick={fetchData}
            disabled={loading || !candidateId}
          >
            {loading ? 'Fetching…' : 'Retrieve Candidate'}
          </button>
        </div>
        {error && <div className="mt-3 text-sm text-red-600">{String(error).slice(0, 300)}</div>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* LEFT: Editor – all collapsible */}
        <div className="card p-4 space-y-4">
          {/* Core */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Core Details</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={() => setForm(getEmptyForm())}
                  disabled={loading}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={() => toggle('core')}
                >
                  {open.core ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {open.core && (
              <div className="grid gap-3 mt-3">
                <label className="grid gap-1">
                  <span className="text-xs text-gray-500">Name</span>
                  <input
                    className="input"
                    value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    disabled={loading}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-xs text-gray-500">Location</span>
                  <input
                    className="input"
                    value={form.location}
                    onChange={e => setField('location', e.target.value)}
                    disabled={loading}
                  />
                </label>
              </div>
            )}
          </section>

          {/* Profile */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Profile</h3>
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => toggle('profile')}
              >
                {open.profile ? 'Hide' : 'Show'}
              </button>
            </div>
            {open.profile && (
              <label className="grid gap-1 mt-3">
                <span className="text-xs text-gray-500">Profile</span>
                <textarea
                  className="input min-h-[120px]"
                  value={form.profile}
                  onChange={e => setField('profile', e.target.value)}
                  disabled={loading}
                />
              </label>
            )}
          </section>

          {/* Key Skills */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Key Skills</h3>
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => toggle('skills')}
              >
                {open.skills ? 'Hide' : 'Show'}
              </button>
            </div>
            {open.skills && (
              <label className="grid gap-1 mt-3">
                <span className="text-xs text-gray-500">Key Skills (comma or newline)</span>
                <textarea
                  className="input min-h-[100px]"
                  value={form.keySkills}
                  onChange={e => setField('keySkills', e.target.value)}
                  disabled={loading}
                />
              </label>
            )}
          </section>

          {/* Employment */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Employment History</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={addEmployment}
                  disabled={loading}
                >
                  Add role
                </button>
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={() => toggle('work')}
                >
                  {open.work ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {open.work && (
              <div className="grid gap-3 mt-3">
                {form.employment.length === 0 ? (
                  <div className="text-sm text-gray-500">No employment history yet.</div>
                ) : (
                  form.employment.map((e, i) => (
                    <div key={i} className="border rounded-xl p-3 grid gap-2">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <input
                          className="input"
                          placeholder="Title"
                          value={e.title || ''}
                          onChange={ev => setEmployment(i, 'title', ev.target.value)}
                          disabled={loading}
                        />
                        <input
                          className="input"
                          placeholder="Company"
                          value={e.company || ''}
                          onChange={ev => setEmployment(i, 'company', ev.target.value)}
                          disabled={loading}
                        />
                        <input
                          className="input"
                          placeholder="Start (MM/YYYY)"
                          value={e.start || ''}
                          onChange={ev => setEmployment(i, 'start', ev.target.value)}
                          disabled={loading}
                        />
                        <input
                          className="input"
                          placeholder="End (MM/YYYY or Present)"
                          value={e.end || ''}
                          onChange={ev => setEmployment(i, 'end', ev.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <textarea
                        className="input min-h-[80px]"
                        placeholder="Description"
                        value={e.description || ''}
                        onChange={ev => setEmployment(i, 'description', ev.target.value)}
                        disabled={loading}
                      />
                      <div className="text-right">
                        <button
                          type="button"
                          className="text-xs text-red-600 underline"
                          onClick={() => removeEmployment(i)}
                          disabled={loading}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {/* Education */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Education & Qualifications</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={addEducation}
                  disabled={loading}
                >
                  Add item
                </button>
                <button
                  type="button"
                  className="text-xs text-gray-500 underline"
                  onClick={() => toggle('education')}
                >
                  {open.education ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {open.education && (
              <div className="grid gap-3 mt-3">
                {form.education.length === 0 ? (
                  <div className="text-sm text-gray-500">No education yet.</div>
                ) : (
                  form.education.map((e, i) => (
                    <div key={i} className="border rounded-xl p-3 grid gap-2">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <input
                          className="input"
                          placeholder="Course / Degree"
                          value={e.course || ''}
                          onChange={ev => setEducation(i, 'course', ev.target.value)}
                          disabled={loading}
                        />
                        <input
                          className="input"
                          placeholder="Institution"
                          value={e.institution || ''}
                          onChange={ev => setEducation(i, 'institution', ev.target.value)}
                          disabled={loading}
                        />
                        <input
                          className="input"
                          placeholder="Start (MM/YYYY)"
                          value={e.start || ''}
                          onChange={ev => setEducation(i, 'start', ev.target.value)}
                          disabled={loading}
                        />
                        <input
                          className="input"
                          placeholder="End (MM/YYYY or Present)"
                          value={e.end || ''}
                          onChange={ev => setEducation(i, 'end', ev.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <div className="text-right">
                        <button
                          type="button"
                          className="text-xs text-red-600 underline"
                          onClick={() => removeEducation(i)}
                          disabled={loading}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {/* Additional */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Additional Information</h3>
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => toggle('extra')}
              >
                {open.extra ? 'Hide' : 'Show'}
              </button>
            </div>

            {open.extra && (
              <div className="grid gap-3 mt-3">
                <div className="grid sm:grid-cols-2 gap-2">
                  <input
                    className="input"
                    placeholder="Driving License"
                    value={form.additional.drivingLicense}
                    onChange={e => setField('additional.drivingLicense', e.target.value)}
                    disabled={loading}
                  />
                  <input
                    className="input"
                    placeholder="Nationality"
                    value={form.additional.nationality}
                    onChange={e => setField('additional.nationality', e.target.value)}
                    disabled={loading}
                  />
                  <input
                    className="input"
                    placeholder="Availability"
                    value={form.additional.availability}
                    onChange={e => setField('additional.availability', e.target.value)}
                    disabled={loading}
                  />
                  <input
                    className="input"
                    placeholder="Health"
                    value={form.additional.health}
                    onChange={e => setField('additional.health', e.target.value)}
                    disabled={loading}
                  />
                  <input
                    className="input"
                    placeholder="Criminal Record"
                    value={form.additional.criminalRecord}
                    onChange={e => setField('additional.criminalRecord', e.target.value)}
                    disabled={loading}
                  />
                  <input
                    className="input"
                    placeholder="Financial History"
                    value={form.additional.financialHistory}
                    onChange={e => setField('additional.financialHistory', e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Raw fetched (debug) */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Raw fetched data (debug)</h3>
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => toggle('raw')}
              >
                {open.raw ? 'Hide' : 'Show'}
              </button>
            </div>
            {open.raw && (
              <div className="mt-3 grid gap-3">
                <pre className="text-xs bg-gray-50 border rounded-xl p-3 overflow-auto">
{JSON.stringify(rawCandidate, null, 2)}
                </pre>
                <pre className="text-xs bg-gray-50 border rounded-xl p-3 overflow-auto">
{JSON.stringify(rawWork, null, 2)}
                </pre>
                <pre className="text-xs bg-gray-50 border rounded-xl p-3 overflow-auto">
{JSON.stringify(rawEdu, null, 2)}
                </pre>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT: Preview */}
        <div className="rounded-2xl border overflow-hidden bg-white">
          <CVTemplatePreview />
        </div>
      </div>
    </div>
  )
}

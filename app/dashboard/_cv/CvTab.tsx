'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type TemplateKey = 'standard' | 'sales'

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
  rawCandidate: boolean
  rawWork: boolean
  rawEdu: boolean
  rawCustom: boolean
}

export default function CvTab({ templateFromShell }: { templateFromShell?: TemplateKey }): JSX.Element {
  // ========== UI state ==========
  const [template, setTemplate] = useState<TemplateKey | null>(templateFromShell ?? null)
  const [candidateId, setCandidateId] = useState<string>('') // used by Standard only
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Raw fetched (debug)
  const [rawCandidate, setRawCandidate] = useState<any>(null)
  const [rawWork, setRawWork] = useState<any[]>([])
  const [rawEdu, setRawEdu] = useState<any[]>([])
  const [rawCustom, setRawCustom] = useState<any>(null)

  // Job Profile helper (Standard)
  const [jobId, setJobId] = useState<string>('')

  // Form that drives preview (Standard)
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

  // Collapsible sections (Standard)
  const [open, setOpen] = useState<OpenState>({
    core: true, profile: true, skills: true, work: true, education: true, extra: true,
    rawCandidate: false, rawWork: false, rawEdu: false, rawCustom: false,
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
    setRawCustom(null)
    setError(null)
    resetSalesState()
  }

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
    const s = String(dateStr).trim()

    const ymd = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/)
    const mmyyyy = s.match(/^(\d{1,2})[\/\-](\d{4})$/)
    const yyyy = s.match(/^(\d{4})$/)

    let y: number | undefined
    let m: number | undefined

    if (ymd) { y = Number(ymd[1]); m = Number(ymd[2]) }
    else if (mmyyyy) { y = Number(mmyyyy[2]); m = Number(mmyyyy[1]) }
    else if (yyyy) { y = Number(yyyy[1]); m = 1 }
    else {
      const d = new Date(s)
      if (!isNaN(d.getTime())) { y = d.getFullYear(); m = d.getMonth() + 1 }
    }

    if (!y || !m) return ''
    const month = new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long' })
    return `${month} ${y}`
  }

  function mapWorkExperiences(list: any[]): Employment[] {
    if (!Array.isArray(list)) return []
    return list.map(w => {
      const start = formatDate(w?.work_from)
      const end = w?.work_to == null ? 'Present' : formatDate(w?.work_to)
      return { title: w?.job_title || '', company: w?.company_name || '', start, end, description: w?.description || '' }
    })
  }

  function mapEducation(list: any[]): Education[] {
    if (!Array.isArray(list)) return []
    return list.map(e => {
      const qualsRaw = e?.qualificications ?? e?.qualifications ?? e?.qualification
      const toArr = (v: any) =>
        Array.isArray(v) ? v.filter(Boolean).map(String)
        : typeof v === 'string' ? v.split(/[,;]\s*/).filter(Boolean)
        : []

      const quals = toArr(qualsRaw)
      const training = toArr(e?.training)
      const honors = toArr(e?.honors)

      const mainTitle = (e?.degree_name && String(e.degree_name)) || (quals[0] || '')
      const extras = [...quals.slice(1), ...training, ...honors]
      let course = extras.length ? `${mainTitle}`.trim() + ` (${extras.join(' • ')})` : `${mainTitle}`.trim()

      const institution = e?.school_name || e?.institution || e?.school || ''
      if (!course) course = institution

      const start = formatDate(e?.start_date || e?.from_date || e?.start) || ''
      const end = formatDate(e?.end_date || e?.to_date || e?.end) || ''

      return { course: course || '', institution, start, end }
    })
  }

  // ---------- state helpers ----------
  function setField(path: string, value: any) {
    setForm(prev => {
      const clone = structuredClone(prev) as any
      const seg = path.split('.')
      let cur = clone
      for (let i = 0; i < seg.length - 1; i++) cur = cur[seg[i]]
      cur[seg[seg.length - 1]] = value
      return clone
    })
  }

  function addEmployment() {
    setForm(prev => ({ ...prev, employment: [...prev.employment, { title: '', company: '', start: '', end: '', description: '' }] }))
  }

  // ========== AI profile (Standard) ==========
  async function generateProfile() {
    try {
      setLoading(true); setError(null)
      const aiRes = await fetch('/api/cv/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'profile', candidate: rawCandidate, work: rawWork, education: rawEdu }),
      })
      const aiData = await aiRes.json()
      if (!aiRes.ok || !aiData?.ok) throw new Error(aiData?.error || 'Profile generation failed.')
      setField('profile', aiData.profile || '')
    } catch (e: any) {
      setError(e?.message || 'Profile generation failed.')
    } finally {
      setLoading(false)
    }
  }

  async function generateJobProfile() {
    if (!jobId) return
    try {
      setLoading(true); setError(null)

      let jobRes = await fetch('/api/job/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      if (!jobRes.ok) {
        jobRes = await fetch(`/api/job/extract?id=${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      }

      const jobJson = await jobRes.json()
      if (!jobRes.ok) throw new Error(jobJson?.error || `Unable to retrieve job ${jobId}`)

      const aiRes = await fetch('/api/cv/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'jobprofile', candidate: rawCandidate, work: rawWork, education: rawEdu, job: jobJson }),
      })

      const aiData = await aiRes.json()
      if (!aiRes.ok || !aiData?.ok) throw new Error(aiData?.error || 'Job Profile generation failed.')
      setField('profile', aiData.profile || '')
    } catch (e: any) {
      setError(e?.message || 'Job Profile generation failed.')
    } finally {
      setLoading(false)
    }
  }

  // ========== data fetch (Standard) ==========
  async function fetchData() {
    if (!candidateId) return
    if (!template) { alert('Please select a template first.'); return }
    setLoading(true); setError(null)
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

      const cRaw = data?.raw?.candidate ?? {}
      const workArr: any[] =
        Array.isArray(data?.raw?.work?.data) ? data.raw.work.data :
        Array.isArray(data?.raw?.work) ? data.raw.work : []
      const eduArr: any[] =
        Array.isArray(data?.raw?.education?.data) ? data.raw.education.data :
        Array.isArray(data?.raw?.education) ? data.raw.education : []
      const customRaw: any = data?.raw?.customfields ?? null

      setRawCandidate(cRaw)
      setRawWork(workArr)
      setRawEdu(eduArr)
      setRawCustom(customRaw)

      const name = [cRaw?.first_name, cRaw?.last_name].filter(Boolean).join(' ').trim()
      const location = cRaw?.candidate_current_address?.town_city ?? ''

      // Optional custom fields mapping
      const UUID_DRIVING = 'edd971dc2678f05b5757fe31f2c586a8'
      const UUID_AVAIL   = 'a18b8e0d62e27548df904106cfde1584'
      const UUID_HEALTH  = '25bf6829933a29172af40f977e9422bc'
      const UUID_CRIM    = '4a4fa5b084a6efee647f98041ccfbc65'
      const UUID_FIN     = '0a8914a354a50d327453c0342effb2c8'

      const drivingEntry = findByKey(customRaw, UUID_DRIVING)
      const availabilityEntry = findByKey(customRaw, UUID_AVAIL)
      const healthEntry = findByKey(customRaw, UUID_HEALTH)
      const criminalEntry = findByKey(customRaw, UUID_CRIM)
      const financialEntry = findByKey(customRaw, UUID_FIN)

      const drivingCode = firstCode(drivingEntry)
      const availabilityCode = firstCode(availabilityEntry)
      const healthCode = firstCode(healthEntry)
      const criminalCode = firstCode(criminalEntry)
      const financialCode = firstCode(financialEntry)

      const DRIVING_MAP: Record<number, string> = {
        1: 'Banned', 2: 'Full UK – No Points', 3: 'Full UK - Points', 4: 'Full - Clean',
        5: 'International', 6: 'No Driving License', 7: 'Other',
      }
      const AVAILABILITY_MAP: Record<number, string> = {
        1: '1 Month', 2: '1 Week', 3: '12 Weeks', 4: '2 Weeks', 5: '3 Weeks',
        6: '4 Weeks', 7: '6 Weeks', 8: '8 Weeks', 9: 'Flexible', 10: 'Immediate',
      }

      const drivingLicense = drivingCode ? (DRIVING_MAP[drivingCode] || '') : ''
      const availability = availabilityCode ? (AVAILABILITY_MAP[availabilityCode] || '') : ''
      const health = healthCode === 1 ? 'Good' : ''
      const criminalRecord = criminalCode === 1 ? 'Good' : ''
      const financialHistory = financialCode === 1 ? 'Good' : ''

      const nationality =
        cRaw?.nationality ??
        cRaw?.candidate_nationality ??
        cRaw?.personal_info?.nationality ??
        ''

      setForm(prev => ({
        ...prev,
        name: name || prev.name,
        location: location || prev.location,
        profile: cRaw?.profile ?? prev.profile,
        keySkills: Array.isArray(cRaw?.skills) ? cRaw.skills.join(', ') : (cRaw?.skills || prev.keySkills || ''),
        employment: mapWorkExperiences(workArr),
        education: mapEducation(eduArr),
        additional: { drivingLicense, nationality, availability, health, criminalRecord, financialHistory },
      }))

      // Collapse all panels except Core
      setOpen({ core: true, profile: false, skills: false, work: false, education: false, extra: false,
        rawCandidate: false, rawWork: false, rawEdu: false, rawCustom: false })
    } catch (e: any) {
      setError(e?.message || 'Failed to retrieve data')
    } finally {
      setLoading(false)
    }
  }

  function findByKey(customRaw: any, uuid: string) {
    if (!customRaw) return null
    const list = Array.isArray(customRaw?.field_values) ? customRaw.field_values : []
    return list.find((x: any) => x?.field_key === uuid) || null
  }
  function firstCode(entry: any): number | null {
    if (!entry) return null
    const v = entry?.value
    if (Array.isArray(v) && v.length) return Number(v[0]?.code ?? null)
    if (typeof v === 'string' && v) return Number(v)
    if (typeof v === 'number') return v
    return null
  }

  // ====================== SALES (Upload + auto DOCX→PDF) ======================
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [salesErr, setSalesErr] = useState<string | null>(null)
  const [salesDocUrl, setSalesDocUrl] = useState<string | null>(null) // object URL
  const [salesDocName, setSalesDocName] = useState<string>('')        // filename (final)
  const [salesDocType, setSalesDocType] = useState<string>('')        // mime type
  const [processing, setProcessing] = useState<boolean>(false)
  const [dragOver, setDragOver] = useState<boolean>(false)

  function resetSalesState() {
    setSalesErr(null)
    if (salesDocUrl) URL.revokeObjectURL(salesDocUrl)
    setSalesDocUrl(null)
    setSalesDocName('')
    setSalesDocType('')
    setProcessing(false)
    setDragOver(false)
  }

  function onClickUpload() {
    fileInputRef.current?.click()
  }

  async function handleFile(f: File) {
    setSalesErr(null)
    if (salesDocUrl) URL.revokeObjectURL(salesDocUrl)

    const isPdfFile = f.type?.includes('pdf') || /\.pdf$/i.test(f.name)
    const isDocx    = f.type?.includes('officedocument.wordprocessingml.document') || /\.docx$/i.test(f.name)
    const isDoc     = f.type === 'application/msword' || /\.doc$/i.test(f.name)

    try {
      setProcessing(true)

      if (isPdfFile) {
        const url = URL.createObjectURL(f)
        setSalesDocUrl(url)
        setSalesDocName(f.name)
        setSalesDocType('application/pdf')
      } else if (isDocx) {
        const fd = new FormData()
        fd.append('file', f)
        const res = await fetch('/api/convert/docx-to-pdf', { method: 'POST', body: fd })
        if (!res.ok) throw new Error((await res.text()) || 'DOCX→PDF conversion failed')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setSalesDocUrl(url)
        setSalesDocName(f.name.replace(/\.docx$/i, '.pdf'))
        setSalesDocType('application/pdf')
      } else if (isDoc) {
        throw new Error('Legacy .doc files are not supported for auto-conversion. Please upload a PDF or DOCX.')
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or DOCX.')
      }
    } catch (err: any) {
      setSalesErr(err?.message || 'Upload failed')
    } finally {
      setProcessing(false)
    }
  }

  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    await handleFile(f)
    e.currentTarget.value = ''
  }

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (ev) => {
    ev.preventDefault()
    setDragOver(false)
    const f = ev.dataTransfer.files?.[0]
    if (f) await handleFile(f)
  }

  const isPdf = useMemo(
    () => (salesDocType?.includes('pdf') || /\.pdf$/i.test(salesDocName)),
    [salesDocType, salesDocName]
  )

  // Branded viewer card (logo header + footer). No upload button here anymore.
  function SalesViewerCard() {
    return (
      <div className="border rounded-2xl overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-white">
          <img src="/zitko-full-logo.png" alt="Zitko" className="h-10" />
          <div className="text-xs text-[#F7941D]">Zitko™ • www.zitkogroup.com • 01480 473245</div>
        </div>

        {/* Document area */}
        <div className="bg-gray-50">
          {salesDocUrl ? (
            isPdf ? (
              <iframe className="w-full h-[70vh] bg-white" src={salesDocUrl} title={salesDocName || 'Document'} />
            ) : (
              <div className="p-4 bg-white">
                <div className="text-sm mb-2">Preview not available for this file type.</div>
                <a className="text-[#F7941D] underline" href={salesDocUrl} download={salesDocName || 'document'}>
                  Download {salesDocName || 'file'}
                </a>
              </div>
            )
          ) : (
            <div className="p-6 text-sm text-gray-600 bg-white">
              No document uploaded yet. Use “Upload CV” above.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 text-center text-[11px] leading-snug text-[#F7941D] bg-white">
          <div>Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Consulting Ltd, Zitko Sales Ltd, Zitko Contracting Ltd and Zitko Talent</div>
          <div>Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL</div>
        </div>
      </div>
    )
  }

  // ========== preview (right) ==========
  function CVTemplatePreview(): JSX.Element {
    if (template === 'sales') {
      return (
        <div className="p-4">
          <SalesViewerCard />
        </div>
      )
    }

    // Standard (existing editor preview)
    return (
      <div className="p-8">
        <div className="flex items-start justify-between">
          <div />
          <img src="/zitko-full-logo.png" alt="Zitko" className="h-12" />
        </div>

        <h1 className="text-2xl font-bold mt-6">Curriculum Vitae</h1>

        <div className="mt-2 text-sm text-gray-800 space-y-0.5">
          <div><span className="font-semibold">Name:</span> {form.name ? `${form.name}` : '—'}</div>
          <div><span className="font-semibold">Location:</span> {form.location ? `${form.location}` : '—'}</div>
        </div>

        <h2 className="text-base font-semibold text-[#F7941D] mt-6 mb-2">Profile</h2>
        <div className="whitespace-pre-wrap text-sm">{form.profile?.trim() ? form.profile : 'No Profile yet'}</div>

        <h2 className="text-base font-semibold text-[#F7941D] mt-6 mb-2">Key Skills</h2>
        <div className="whitespace-pre-wrap text-sm">
          {(() => {
            const items = (form.keySkills || '').split(/\r?\n|,\s*/).map(s => s.trim()).filter(Boolean)
            if (items.length === 0) return 'No Key Skills yet'
            return items.map((s, i) => <div key={i}>• {s}</div>)
          })()}
        </div>

        <h2 className="text-base font-semibold text-[#F7941D] mt-6 mb-2">Employment History</h2>
        <div className="space-y-3">
          {form.employment.length === 0 ? (
            <div className="text-gray-500 text-sm">No employment history yet.</div>
          ) : (
            form.employment.map((e, i) => {
              const range = [e.start, e.end].filter(Boolean).join(' to ')
              return (
                <div key={i} className="flex justify-between">
                  <div>
                    <div className="font-medium">{e.title || 'Role'}</div>
                    <div className="text-xs text-gray-500">{e.company}</div>
                    {e.description?.trim() && <div className="text-sm mt-1 whitespace-pre-wrap">{e.description}</div>}
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">{range}</div>
                </div>
              )
            })
          )}
        </div>

        <h2 className="text-base font-semibold text-[#F7941D] mt-6 mb-2">Education & Qualifications</h2>
        <div className="space-y-3">
          {form.education.length === 0 ? (
            <div className="text-gray-500 text-sm">No education yet.</div>
          ) : (
            form.education.map((e, i) => {
              const range = [e.start, e.end].filter(Boolean).join(' to ')
              const showInstitutionLine = !!e.institution && !!e.course && e.course.trim().toLowerCase() !== e.institution.trim().toLowerCase()
              return (
                <div key={i} className="flex justify-between">
                  <div>
                    <div className="font-medium">{e.course || e.institution || 'Course'}</div>
                    {showInstitutionLine && <div className="text-xs text-gray-500">{e.institution}</div>}
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">{range}</div>
                </div>
              )
            })
          )}
        </div>

        <h2 className="text-base font-semibold text-[#F7941D] mt-6 mb-2">Additional Information</h2>
        <div className="text-sm grid gap-1">
          <div>Driving License: {form.additional.drivingLicense || '—'}</div>
          <div>Nationality: {form.additional.nationality || '—'}</div>
          <div>Availability: {form.additional.availability || '—'}</div>
          <div>Health: {form.additional.health || '—'}</div>
          <div>Criminal Record: {form.additional.criminalRecord || '—'}</div>
          <div>Financial History: {form.additional.financialHistory || '—'}</div>
        </div>

        <div className="mt-8 pt-4 border-t text-center text-[11px] leading-snug text-[#F7941D]">
          <div>Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Consulting Ltd, Zitko Sales Ltd, Zitko Contracting Ltd and Zitko Talent</div>
          <div>Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL</div>
          <div>Tel: 01480 473245 Web: www.zitkogroup.com</div>
        </div>
      </div>
    )
  }

  // ========== render ==========
  return (
    <div className="grid gap-4">
      <div className="card p-4">
        {!templateFromShell && (
          <div className="grid sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => resetAllForTemplate('standard')}
              className={`btn w-full ${template === 'standard' ? 'btn-brand' : 'btn-grey'}`}
            >
              Standard
            </button>

            <button
              type="button"
              onClick={() => resetAllForTemplate('sales')}
              className={`btn w-full ${template === 'sales' ? 'btn-brand' : 'btn-grey'}`}
              title="Sales template: upload a CV (PDF/DOCX)"
            >
              Sales
            </button>
          </div>
        )}

        {/* Top controls: Standard vs Sales */}
        {template === 'standard' && (
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
        )}

        {template === 'sales' && (
          <>
            {/* Hidden real input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onUploadChange}
              className="hidden"
            />

            {/* Faux input + button (same placement/layout as Standard) */}
            <div
              className={`grid sm:grid-cols-[1fr_auto] gap-2 mt-4`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <div
                className={`input flex items-center justify-between cursor-pointer ${dragOver ? 'ring-2 ring-[#F7941D]/50' : ''}`}
                title="Upload or drag a file here"
                onClick={onClickUpload}
              >
                <span className={`text-gray-400 select-none ${salesDocName ? '!text-gray-700 truncate' : ''}`}>
                  {salesDocName ? salesDocName : 'Upload or drag a file here'}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-brand"
                onClick={onClickUpload}
                disabled={processing}
                title="Upload a PDF or Word (DOCX) document"
              >
                {processing ? 'Processing…' : 'Upload CV'}
              </button>
            </div>

            {salesErr && <div className="mt-3 text-sm text-red-600">{String(salesErr).slice(0, 300)}</div>}
          </>
        )}

        {error && <div className="mt-3 text-sm text-red-600">{String(error).slice(0, 300)}</div>}
      </div>

      {/* When Sales is selected we only show the right column (viewer) */}
      <div className="grid md:grid-cols-2 gap-4">
        {template === 'standard' && (
          <div className="card p-4 space-y-4">
            {/* Standard editor (unchanged) */}
            {/* Core */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Core Details</h3>
                <div className="flex items-center gap-3">
                  <button type="button" className="text-xs text-gray-500 underline" onClick={() => toggle('core')}>
                    {open.core ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {open.core && (
                <div className="grid gap-3 mt-3">
                  <label className="grid gap-1">
                    <span className="text-xs text-gray-500">Name</span>
                    <input className="input" value={form.name} onChange={e => setField('name', e.target.value)} disabled={loading} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-gray-500">Location</span>
                    <input className="input" value={form.location} onChange={e => setField('location', e.target.value)} disabled={loading} />
                  </label>
                </div>
              )}
            </section>

            {/* Profile */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Profile</h3>
                <button type="button" className="text-xs text-gray-500 underline" onClick={() => toggle('profile')}>
                  {open.profile ? 'Hide' : 'Show'}
                </button>
              </div>
              {open.profile && (
                <div className="mt-3">
                  <div className="flex flex-col sm:flex-row gap-2 mb-3 items-stretch sm:items-center">
                    <button
                      type="button"
                      className="btn btn-grey text-xs !px-3 !py-1.5 w-36 whitespace-nowrap"
                      disabled={loading || !rawCandidate}
                      onClick={generateProfile}
                      title={!rawCandidate ? 'Retrieve a candidate first' : 'Generate profile from candidate data'}
                    >
                      Generate
                    </button>
                    <div className="border-t border-gray-200 my-2 sm:my-0 sm:mx-2 sm:border-t-0 sm:border-l sm:h-6" />
                    <input className="input flex-1 min-w-[160px]" placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} disabled={loading} />
                    <button
                      type="button"
                      className="btn btn-grey text-xs !px-3 !py-1.5 w-36 whitespace-nowrap"
                      disabled={loading || !rawCandidate || !jobId}
                      onClick={generateJobProfile}
                      title={!jobId ? 'Enter a Job ID' : 'Generate job-tailored profile'}
                    >
                      Generate for Job
                    </button>
                  </div>

                  <label className="grid gap-1">
                    <span className="text-xs text-gray-500">Profile</span>
                    <textarea className="input min-h-[120px]" value={form.profile} onChange={e => setField('profile', e.target.value)} disabled={loading} />
                  </label>
                </div>
              )}
            </section>

            {/* Key Skills */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Key Skills</h3>
                <button type="button" className="text-xs text-gray-500 underline" onClick={() => toggle('skills')}>
                  {open.skills ? 'Hide' : 'Show'}
                </button>
              </div>
              {open.skills && (
                <label className="grid gap-1 mt-3">
                  <span className="text-xs text-gray-500">Key Skills (comma or newline)</span>
                  <textarea className="input min-h-[100px]" value={form.keySkills} onChange={e => setField('keySkills', e.target.value)} disabled={loading} />
                </label>
              )}
            </section>

            {/* Employment */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Employment History</h3>
                <div className="flex items-center gap-3">
                  <button type="button" className="text-xs text-gray-500 underline" onClick={addEmployment} disabled={loading}>Add role</button>
                  <button type="button" className="text-xs text-gray-500 underline" onClick={() => toggle('work')}>
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
                        <label className="grid gap-1">
                          <span className="text-xs text-gray-500">Title</span>
                          <input className="input" value={e.title || ''} onChange={ev => {
                            const v = ev.target.value
                            setForm(prev => {
                              const copy = structuredClone(prev); copy.employment[i].title = v; return copy
                            })
                          }} />
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="grid gap-1">
                            <span className="text-xs text-gray-500">Company</span>
                            <input className="input" value={e.company || ''} onChange={ev => {
                              const v = ev.target.value
                              setForm(prev => { const copy = structuredClone(prev); copy.employment[i].company = v; return copy })
                            }} />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1">
                              <span className="text-xs text-gray-500">Start</span>
                              <input className="input" value={e.start || ''} onChange={ev => {
                                const v = ev.target.value
                                setForm(prev => { const copy = structuredClone(prev); copy.employment[i].start = v; return copy })
                              }} />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-xs text-gray-500">End</span>
                              <input className="input" value={e.end || ''} onChange={ev => {
                                const v = ev.target.value
                                setForm(prev => { const copy = structuredClone(prev); copy.employment[i].end = v; return copy })
                              }} />
                            </label>
                          </div>
                        </div>
                        <label className="grid gap-1">
                          <span className="text-xs text-gray-500">Description</span>
                          <textarea className="input min-h-[80px]" value={e.description || ''} onChange={ev => {
                            const v = ev.target.value
                            setForm(prev => { const copy = structuredClone(prev); copy.employment[i].description = v; return copy })
                          }} />
                        </label>
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
                <button type="button" className="text-xs text-gray-500 underline" onClick={() => toggle('education')}>
                  {open.education ? 'Hide' : 'Show'}
                </button>
              </div>

              {open.education && (
                <div className="grid gap-3 mt-3">
                  {form.education.length === 0 ? (
                    <div className="text-sm text-gray-500">No education yet.</div>
                  ) : (
                    form.education.map((e, i) => (
                      <div key={i} className="flex items-start justify-between">
                        <div className="grid gap-0.5">
                          <div className="font-medium">{e.course || e.institution || 'Course'}</div>
                          {!!e.institution && !!e.course && e.course.trim().toLowerCase() !== e.institution.trim().toLowerCase() && (
                            <div className="text-xs text-gray-500">{e.institution}</div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 whitespace-nowrap">{[e.start, e.end].filter(Boolean).join(' to ')}</div>
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
                <button type="button" className="text-xs text-gray-500 underline" onClick={() => toggle('extra')}>
                  {open.extra ? 'Hide' : 'Show'}
                </button>
              </div>

              {open.extra && (
                <div className="text-sm grid gap-1 mt-3">
                  <div>Driving License: {form.additional.drivingLicense || '—'}</div>
                  <div>Nationality: {form.additional.nationality || '—'}</div>
                  <div>Availability: {form.additional.availability || '—'}</div>
                  <div>Health: {form.additional.health || '—'}</div>
                  <div>Criminal Record: {form.additional.criminalRecord || '—'}</div>
                  <div>Financial History: {form.additional.financialHistory || '—'}</div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* RIGHT: viewer always renders here */}
        <div className="card p-0 overflow-hidden">
          <CVTemplatePreview />
        </div>
      </div>
    </div>
  )
}

'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

/**
 * CvTab.tsx — full drop-in replacement (Sales editable DOCX-in-browser flow)
 * - SALES: any → DOCX (CloudConvert) → HTML (mammoth) → in-app editor
 * - SALES preview shows Zitko header/footer immediately (chrome)
 * - SALES upload: DOM→PDF (html2pdf.js), then post to Vincere (base64 or URL)
 * - STANDARD flow unchanged (DOM→PDF, as before)
 */

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

// === Size threshold for choosing base64 vs URL ===
const BASE64_THRESHOLD_BYTES = 3 * 1024 * 1024 // ~3 MB

// ---- brand assets (served from /public) ----
const LOGO_PATH = '/zitko-full-logo.png'
const BRAND = {
  ORANGE_HEX: '#F7941D',
  FOOTER_LINES: [
    'Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Inc',
    'Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL',
    'Tel: 01480 473245  Web: www.zitkogroup.com',
  ],
}

// ---------- helpers for education/work mapping ----------
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

/** Convert Vincere rich text (e.g., <p>…<br>…) to clean multiline plain text */
function cleanRichTextToPlain(input: unknown): string {
  if (!input) return ''
  let s = String(input)

  // Normalize line breaks first
  s = s.replace(/<\s*br\s*\/?>/gi, '\n')
  s = s.replace(/<\/\s*p\s*>\s*<\s*p[^>]*>/gi, '\n') // paragraph boundaries → newline

  // Drop remaining tags
  s = s.replace(/<\/?[^>]+>/g, '')

  // Decode HTML entities using the DOM (browser only)
  if (typeof window !== 'undefined') {
    const ta = document.createElement('textarea')
    ta.innerHTML = s
    s = ta.value
  }

  // Tidy whitespace/newlines
  s = s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return s
}

function mapWorkExperiences(list: any[]): Employment[] {
  if (!Array.isArray(list)) return []
  return list.map((w) => {
    const start = formatDate(w?.work_from)
    const end = w?.work_to == null ? 'Present' : formatDate(w?.work_to)

    // Prefer experience_in_company; fall back to description. Strip HTML to plain text
    const rawDesc = w?.experience_in_company ?? w?.description ?? ''
    const description = cleanRichTextToPlain(rawDesc)

    return {
      title: w?.job_title || '',
      company: w?.company_name || '',
      start,
      end,
      description,
    }
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

// ---------- robust custom-field normalizers ----------
type CustomEntry = {
  field_key?: string
  key?: string
  value?: any
  field_values?: any[] | null
  field_value_ids?: any[] | null
  [k: string]: any
}

function customArray(custom: any): CustomEntry[] {
  if (!custom) return []
  if (Array.isArray(custom?.field_values)) return custom.field_values as CustomEntry[]
  if (Array.isArray(custom?.data)) return custom.data as CustomEntry[]
  if (Array.isArray(custom)) return custom as CustomEntry[]
  if (typeof custom === 'object') {
    return Object.entries(custom).map(([k, v]) => {
      const obj = (typeof v === 'object' && v) ? (v as any) : { value: v }
      return { key: k, ...obj }
    })
  }
  return []
}
function findByUuid(custom: any, uuid: string): CustomEntry | null {
  const arr = customArray(custom)
  return arr.find(e => e?.field_key === uuid || e?.key === uuid) ?? null
}
function firstCodeUniversal(entry: CustomEntry | null): number | null {
  if (!entry) return null
  if (Array.isArray(entry.value) && entry.value.length) {
    const raw = entry.value[0]
    const n = Number((raw && (raw.code ?? raw.value ?? raw)) ?? NaN)
    return Number.isFinite(n) ? n : null
  }
  if (typeof entry.value === 'string' || typeof entry.value === 'number') {
    const n = Number(entry.value)
    return Number.isFinite(n) ? n : null
  }
  if (Array.isArray(entry.field_values) && entry.field_values.length) {
    const n = Number(entry.field_values[0])
    return Number.isFinite(n) ? n : null
  }
  if (Array.isArray(entry.field_value_ids) && entry.field_value_ids.length) {
    const n = Number(entry.field_value_ids[0])
    return Number.isFinite(n) ? n : null
  }
  return null
}

export default function CvTab({ templateFromShell }: { templateFromShell?: TemplateKey }): JSX.Element {
  // ========== UI state ==========
  const [template, setTemplate] = useState<TemplateKey | null>(templateFromShell ?? null)
  const [candidateId, setCandidateId] = useState<string>('') // Standard flow target
  const [candidateName, setCandidateName] = useState<string>('') // populated after retrieve (Standard)
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
  }>(() => ({
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
  }))

  // Collapsible sections (Standard)
  const [open, setOpen] = useState<OpenState>({
    core: true, profile: true, skills: true, work: true, education: true, extra: true,
    rawCandidate: false, rawWork: false, rawEdu: false, rawCustom: false,
  })

  // ===== Upload modal (both Standard & Sales) =====
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadContext, setUploadContext] = useState<'standard' | 'sales'>('standard')
  const [uploadFileName, setUploadFileName] = useState<string>('CV.pdf')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadCandidateId, setUploadCandidateId] = useState<string>('') // Manual ID for Sales modal

  // Standard preview ref (for DOM→PDF export)
  const standardPreviewRef = useRef<HTMLDivElement | null>(null)
  const footerRef = useRef<HTMLDivElement | null>(null)

  // ================== local helpers ==================
  const [salesErr, setSalesErr] = useState<string | null>(null)
  const [salesDocName, setSalesDocName] = useState<string>('')         // original file name
  const [salesDocType, setSalesDocType] = useState<string>('')         // mime type (for display)
  const [processing, setProcessing] = useState<boolean>(false)
  const [dragOver, setDragOver] = useState<boolean>(false)

  // NEW (Sales editor)
  const [salesEditorHtml, setSalesEditorHtml] = useState<string>('')   // editable HTML
  const salesEditorRef = useRef<HTMLDivElement | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function resetSalesState() {
    setSalesErr(null)
    setSalesDocName('')
    setSalesDocType('')
    setSalesEditorHtml('')
    setProcessing(false)
    setDragOver(false)
  }

  function resetAllForTemplate(t: TemplateKey | null) {
    setTemplate(t)
    setForm({
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
    })
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
        credentials: 'include',
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

      // Custom field UUIDs
      const UUID_DRIVING = 'edd971dc2678f05b5757fe31f2c586a8'
      const UUID_AVAIL   = 'a18b8e0d62e27548df904106cfde1584'
      const UUID_HEALTH  = '25bf6829933a29172af40f977e9422bc'
      const UUID_CRIM    = '4a4fa5b084a6efee647f98041ccfbc65'
      const UUID_FIN     = '0a8914a354a50d327453c0342effb2c8'

      const drivingEntry    = findByUuid(customRaw, UUID_DRIVING)
      const availabilityEnt = findByUuid(customRaw, UUID_AVAIL)
      const healthEntry     = findByUuid(customRaw, UUID_HEALTH)
      const criminalEntry   = findByUuid(customRaw, UUID_CRIM)
      const financialEntry  = findByUuid(customRaw, UUID_FIN)

      const drivingCode      = firstCodeUniversal(drivingEntry)
      const availabilityCode = firstCodeUniversal(availabilityEnt)
      const healthCode       = firstCodeUniversal(healthEntry)
      const criminalCode     = firstCodeUniversal(criminalEntry)
      const financialCode    = firstCodeUniversal(financialEntry)

      const DRIVING_MAP: Record<number, string> = {
        1: 'Banned', 2: 'Full UK – No Points', 3: 'Full UK - Points', 4: 'Full - Clean',
        5: 'International', 6: 'No Driving License', 7: 'Other',
      }
      const AVAILABILITY_MAP: Record<number, string> = {
        1: '1 Month', 2: '1 Week', 3: '12 Weeks', 4: '2 Weeks', 5: '3 Weeks',
        6: '4 Weeks', 7: '6 Weeks', 8: '8 Weeks', 9: 'Flexible', 10: 'Immediate',
      }

      const drivingLicense   = drivingCode ? (DRIVING_MAP[drivingCode] || '') : ''
      const availability     = availabilityCode ? (AVAILABILITY_MAP[availabilityCode] || '') : ''
      const health           = healthCode === 1 ? 'Good' : ''
      const criminalRecord   = criminalCode === 1 ? 'Good' : ''
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

      setCandidateName(name)

      // Keep Profile section open after retrieve
      setOpen({
        core: true, profile: true, skills: false, work: false, education: false, extra: false,
        rawCandidate: false, rawWork: false, rawEdu: false, rawCustom: false
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to retrieve data')
    } finally {
      setLoading(false)
    }
  }

  // ====================== SALES (editable) ======================
  function onClickUpload() {
    fileInputRef.current?.click()
  }

  // Convert a Blob to a base64 string (browser-safe)
  async function blobToBase64(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  // Upload a Blob to /api/upload and get public URL back (used for large files)
  async function uploadBlobToPublicUrl(file: Blob, desiredName: string): Promise<string> {
    const fd = new FormData()
    fd.append('file', new File([file], desiredName, { type: (file as any).type || 'application/octet-stream' }))
    fd.append('filename', desiredName)

    const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' })

    let data: any = null
    const text = await res.text()
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

    if (!res.ok || !data?.ok || !data?.url) {
      const errMsg =
        (typeof data?.error === 'string' && data.error) ||
        (typeof data?.message === 'string' && data.message) ||
        (data?.error && typeof data.error?.message === 'string' && data.error.message) ||
        (typeof data?.raw === 'string' && data.raw) ||
        `Blob upload failed (${res.status})`
      throw new Error(errMsg)
    }
    return data.url as string
  }

  // --- Vincere POST helpers (accept candidate ID explicitly) ---
  async function postBase64ToVincere(fileName: string, base64: string, cid: string) {
    const payload = { file_name: fileName, document_type_id: 1, base_64_content: base64, original_cv: true }
    const res = await fetch(`/api/vincere/candidate/${encodeURIComponent(cid)}/file`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    const raw = await res.text()
    let data: any = null
    try { data = raw ? JSON.parse(raw) : {} } catch { data = { raw } }

    if (!res.ok || !data?.ok) {
      const errMsg =
        (typeof data?.error === 'string' && data.error) ||
        (typeof data?.message === 'string' && data.message) ||
        (data?.error && typeof data.error?.message === 'string' && data.error.message) ||
        (typeof data?.raw === 'string' && data.raw) ||
        `Upload to Vincere failed (${res.status})`
      throw new Error(errMsg)
    }
  }

  async function postFileUrlToVincere(fileName: string, publicUrl: string, cid: string) {
    const payload = { file_name: fileName, document_type_id: 1, url: publicUrl, original_cv: true }
    const res = await fetch(`/api/vincere/candidate/${encodeURIComponent(cid)}/file`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    const raw = await res.text()
    let data: any = null
    try { data = raw ? JSON.parse(raw) : {} } catch { data = { raw } }

    if (!res.ok || !data?.ok) {
      const errMsg =
        (typeof data?.error === 'string' && data.error) ||
        (typeof data?.message === 'string' && data.message) ||
        (data?.error && typeof data.error?.message === 'string' && data.error.message) ||
        (typeof data?.raw === 'string' && data.raw) ||
        `Upload to Vincere failed (${res.status})`
      throw new Error(errMsg)
    }
  }

  // NEW: handle Sales file — any → DOCX → HTML editor
  async function handleFile(f: File) {
    setSalesErr(null)

    try {
      setProcessing(true)

      // 1) Ensure DOCX
      let docxBlob: Blob
      if (!/\.docx$/i.test(f.name)) {
        const fd = new FormData()
        fd.append('file', f, f.name)
        const res = await fetch('/api/cloudconvert/any-to-docx', { method: 'POST', body: fd })
        if (!res.ok) {
          let msg = `Convert to DOCX failed (${res.status})`
          try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
          throw new Error(msg)
        }
        const arr = await res.arrayBuffer()
        docxBlob = new Blob([arr], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
      } else {
        docxBlob = f
      }

      // 2) DOCX → HTML (server-side mammoth)
      const fd2 = new FormData()
      fd2.append('file', docxBlob, f.name.replace(/\.[^.]+$/, '') + '.docx')
      const htmlRes = await fetch('/api/docx/to-html', { method: 'POST', body: fd2 })
      if (!htmlRes.ok) {
        let msg = `DOCX→HTML failed (${htmlRes.status})`
        try { const j = await htmlRes.json(); if (j?.error) msg = j.error } catch {}
        throw new Error(msg)
      }
      const { html } = await htmlRes.json()

      // 3) Fill editor / preview
      setSalesEditorHtml(sanitiseHtml(html))
      setSalesDocName(f.name)
      setSalesDocType('text/html')
      setSalesErr(null)
    } catch (e: any) {
      setSalesErr(e?.message || 'Failed to process file')
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

  // STANDARD: export right-panel DOM to PDF and upload (NO baking here)
  async function uploadStandardPreviewToVincereUrl(finalName: string, cid: string) {
    const mod = await import('html2pdf.js')
    const html2pdf = (mod as any).default || (mod as any)

    const node = standardPreviewRef.current
    if (!node) throw new Error('Preview not ready')

    const opt = {
      margin: 10, // mm
      filename: finalName,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#FFFFFF' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] as const },
    }

    const worker = html2pdf().set(opt).from(node).toPdf()
    const pdf = await worker.get('pdf')
    const pdfBlob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' })

    if (pdfBlob.size <= BASE64_THRESHOLD_BYTES) {
      const base64 = await blobToBase64(pdfBlob)
      await postBase64ToVincere(finalName, base64, cid)
    } else {
      const publicUrl = await uploadBlobToPublicUrl(pdfBlob, finalName)
      await postFileUrlToVincere(finalName, publicUrl, cid)
    }
  }

  // NEW (Sales): export EDITED HTML (with header/footer chrome) to PDF and upload
  async function uploadSalesEditedToVincereUrl(finalName: string, cid: string) {
    const mod = await import('html2pdf.js')
    const html2pdf = (mod as any).default || (mod as any)

    // Build a temporary DOM node that includes header + body + footer (same as preview)
    const container = document.createElement('div')
    container.className = 'p-6 cv-standard-page bg-white text-[13px] leading-[1.35]'
    container.innerHTML = `
      <div class="flex items-start justify-between">
        <div></div>
        <img src="${LOGO_PATH}" alt="Zitko" class="h-10" />
      </div>
      <h1 class="text-2xl font-bold mt-5">Curriculum Vitae</h1>
      <div class="mt-5 prose max-w-none">${salesEditorHtml || ''}</div>
      <div class="mt-6 pt-4 border-t text-center text-[10px] leading-snug" style="color:${BRAND.ORANGE_HEX}">
        ${BRAND.FOOTER_LINES.map(l => `<div>${l}</div>`).join('')}
      </div>
    `
    document.body.appendChild(container)

    try {
      const opt = {
        margin: 10, // mm
        filename: finalName,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, backgroundColor: '#FFFFFF' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] as const },
      }

      const worker = html2pdf().set(opt).from(container).toPdf()
      const pdf = await worker.get('pdf')
      const pdfBlob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' })

      if (pdfBlob.size <= BASE64_THRESHOLD_BYTES) {
        const base64 = await blobToBase64(pdfBlob)
        await postBase64ToVincere(finalName, base64, cid)
      } else {
        const publicUrl = await uploadBlobToPublicUrl(pdfBlob, finalName)
        await postFileUrlToVincere(finalName, publicUrl, cid)
      }
    } finally {
      container.remove()
    }
  }

  async function confirmUpload() {
    try {
      setUploadBusy(true)
      setUploadErr(null)
      setUploadSuccess(null)

      const cid = (uploadContext === 'sales' ? uploadCandidateId : candidateId).trim()
      if (!cid) throw new Error('Please enter a Candidate ID')
      if (!uploadFileName?.trim()) throw new Error('Please enter a file name')

      let finalName = uploadFileName.trim()
      if (!/\.pdf$/i.test(finalName)) finalName += '.pdf'

      if (uploadContext === 'standard') {
        await uploadStandardPreviewToVincereUrl(finalName, cid)
      } else {
        await uploadSalesEditedToVincereUrl(finalName, cid)
      }

      setUploadSuccess('Upload Successful')
    } catch (e: any) {
      const msg =
        (e && typeof e.message === 'string' && e.message) ||
        (typeof e === 'string' && e) ||
        (e?.response && typeof e.response?.data === 'string' && e.response.data) ||
        (e?.response && typeof e.response?.data?.message === 'string' && e.response.data.message) ||
        (e?.error && typeof e.error?.message === 'string' && e.error.message) ||
        JSON.stringify(e)
      setUploadErr(msg)
    } finally {
      setUploadBusy(false)
    }
  }

  // ========== preview (right) ==========
  function CVTemplatePreview(): JSX.Element {
    // SALES: show editor content with header/footer chrome
    if (template === 'sales') {
      return (
        <div className="p-4">
          <div className="border rounded-2xl overflow-hidden bg-white">
            <div className="p-6 cv-standard-page bg-white text-[13px] leading-[1.35]">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div />
                <img src="/zitko-full-logo.png" alt="Zitko" className="h-10" />
              </div>

              <h1 className="text-2xl font-bold mt-5">Curriculum Vitae</h1>

              {/* Edited content */}
              <div
                className="mt-5 prose max-w-none"
                dangerouslySetInnerHTML={{ __html: salesEditorHtml || '<p class="text-gray-500 text-[12px]">No content yet. Import a CV to start editing.</p>' }}
              />

              {/* Footer */}
              <div className="mt-6 pt-4 border-t text-center text-[10px] leading-snug text-[#F7941D] break-inside-avoid cv-footer">
                {BRAND.FOOTER_LINES.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          </div>
          <div className="px-1 pt-2 text-[11px] text-gray-500">
            Preview shows branding; uploaded PDF will match this layout.
          </div>
        </div>
      )
    }

    // Standard (editor preview) — attach ref for DOM→PDF
    return (
      <div
        ref={standardPreviewRef}
        className="p-6 cv-standard-page bg-white text-[13px] leading-[1.35]"
      >
        <div className="flex items-start justify-between">
          <div />
          <img src="/zitko-full-logo.png" alt="Zitko" className="h-10" />
        </div>

        <h1 className="text-2xl font-bold mt-5">Curriculum Vitae</h1>

        <div className="mt-2 text-[12px] text-gray-800 space-y-0.5">
          <div>
            <span className="font-semibold">Name:</span>{' '}
            {form.name ? `${form.name}` : '—'}
          </div>
          <div>
            <span className="font-semibold">Location:</span>{' '}
            {form.location ? `${form.location}` : '—'}
          </div>
        </div>

        <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">
          Profile
        </h2>
        <div className="whitespace-pre-wrap text-[12px]">
          {form.profile?.trim() ? form.profile : 'No Profile yet'}
        </div>

        <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">
          Key Skills
        </h2>
        <div className="text-[12px]">
          {(() => {
            const items = (form.keySkills || '')
              .split(/\r?\n|,\s*/).map(s => s.trim())
              .filter(Boolean)

            if (items.length === 0) return 'No Key Skills yet'

            const mid = Math.ceil(items.length / 2)
            const col1 = items.slice(0, mid)
            const col2 = items.slice(mid)

            return (
              <div className="grid grid-cols-2 gap-x-6">
                <div className="space-y-1">
                  {col1.map((s, i) => (
                    <div key={`ks1-${i}`}>• {s}</div>
                  ))}
                </div>
                <div className="space-y-1">
                  {col2.map((s, i) => (
                    <div key={`ks2-${i}`}>• {s}</div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Employment History (header + first entry stay together) */}
        {form.employment.length === 0 ? (
          <div className="cv-headpair">
            <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">
              Employment History
            </h2>
            <div className="text-gray-500 text-[12px]">No employment history yet.</div>
          </div>
        ) : (
          <>
            <div className="cv-headpair">
              <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">
                Employment History
              </h2>
              {(() => {
                const e = form.employment[0]
                const range = [e.start, e.end].filter(Boolean).join(' to ')
                return (
                  <div className="cv-entry">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium">{e.title || 'Role'}</div>
                        <div className="text-[11px] text-gray-500">{e.company}</div>
                        {e.description?.trim() && (
                          <div className="text-[12px] mt-1 whitespace-pre-wrap">
                            {e.description}
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 whitespace-nowrap">{range}</div>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="space-y-3">
              {form.employment.slice(1).map((e, i) => {
                const range = [e.start, e.end].filter(Boolean).join(' to ')
                return (
                  <div key={i} className="cv-entry">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium">{e.title || 'Role'}</div>
                        <div className="text-[11px] text-gray-500">{e.company}</div>
                        {e.description?.trim() && (
                          <div className="text-[12px] mt-1 whitespace-pre-wrap">
                            {e.description}
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 whitespace-nowrap">{range}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Education & Qualifications (header + first entry stay together) */}
        {form.education.length === 0 ? (
          <div className="cv-headpair">
            <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">
              Education & Qualifications
            </h2>
            <div className="text-gray-500 text-[12px]">No education yet.</div>
          </div>
        ) : (
          <>
            <div className="cv-headpair">
              <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">
                Education & Qualifications
              </h2>
              {(() => {
                const e = form.education[0]
                const range = [e.start, e.end].filter(Boolean).join(' to ')
                const showInstitutionLine =
                  !!e.institution &&
                  !!e.course &&
                  e.course.trim().toLowerCase() !== e.institution.trim().toLowerCase()
                return (
                  <div className="cv-entry">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{e.course || e.institution || 'Course'}</div>
                        {showInstitutionLine && (
                          <div className="text-[11px] text-gray-500">{e.institution}</div>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 whitespace-nowrap">{range}</div>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="space-y-3">
              {form.education.slice(1).map((e, i) => {
                const range = [e.start, e.end].filter(Boolean).join(' to ')
                const showInstitutionLine =
                  !!e.institution &&
                  !!e.course &&
                  e.course.trim().toLowerCase() !== e.institution.trim().toLowerCase()
                return (
                  <div key={i} className="cv-entry">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{e.course || e.institution || 'Course'}</div>
                        {showInstitutionLine && (
                          <div className="text-[11px] text-gray-500">{e.institution}</div>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 whitespace-nowrap">{range}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Additional Information */}
        <div className="cv-headpair">
          <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">
            Additional Information
          </h2>
          <div className="text-[12px] grid gap-1">
            <div>Driving License: {form.additional.drivingLicense || '—'}</div>
            <div>Nationality: {form.additional.nationality || '—'}</div>
            <div>Availability: {form.additional.availability || '—'}</div>
            <div>Health: {form.additional.health || '—'}</div>
            <div>Criminal Record: {form.additional.criminalRecord || '—'}</div>
            <div>Financial History: {form.additional.financialHistory || '—'}</div>
          </div>
        </div>

        {/* Footer (pushed to bottom by CSS) */}
        <div
          ref={footerRef}
          className="mt-6 pt-4 border-t text-center text-[10px] leading-snug text-[#F7941D] break-inside-avoid cv-footer"
        >
          <div>{BRAND.FOOTER_LINES[0]}</div>
          <div>{BRAND.FOOTER_LINES[1]}</div>
          <div>{BRAND.FOOTER_LINES[2]}</div>
        </div>
      </div>
    )
  }

  // ========== render ==========
  return (
    <div className="grid gap-4">
      {/* Minimal print + PDF styles */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 12mm; }

          /* A4 content container; makes footer stick to bottom of last page */
          .cv-standard-page {
            width: 100%;
            display: flex;
            flex-direction: column;
            min-height: calc(297mm - 24mm); /* page height minus top+bottom margins */
          }

          /* keep each job/education entry intact (no splitting across pages) */
          .cv-entry { break-inside: avoid; page-break-inside: avoid; }

          /* keep section header with the FIRST entry only */
          .cv-headpair { break-inside: avoid; page-break-inside: avoid; }

          /* prevent headings from being orphaned/split */
          .cv-standard-page h1,
          .cv-standard-page h2 { break-inside: avoid; page-break-inside: avoid; }

          /* footer pinned to bottom; never creates a blank page */
          .cv-footer {
            margin-top: auto;
            break-inside: avoid;
            page-break-inside: avoid;
            page-break-before: auto;
            page-break-after: auto;
          }
        }

        /* Also help in on-screen preview */
        .cv-entry,
        .cv-headpair { break-inside: avoid; page-break-inside: avoid; }
      `}</style>

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
              title="Sales template: import a CV (any format)"
            >
              Sales
            </button>
          </div>
        )}

        {/* Top controls: Standard vs Sales */}
        {template === 'standard' && (
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mt-4">
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
              title="Retrieve Candidate"
            >
              {loading ? 'Fetching…' : 'Retrieve Candidate'}
            </button>

            {/* Upload (Standard) */}
            <button
              type="button"
              className="btn btn-grey"
              disabled={!candidateId}
              onClick={() => {
                const defaultName = `${(candidateName || form.name || 'CV').replace(/\s+/g, '')}_Standard.pdf`
                setUploadFileName(defaultName)
                setUploadContext('standard')
                setUploadErr(null)
                setUploadSuccess(null)
                setShowUploadModal(true)
              }}
              title="Export the right panel CV to PDF and upload to Vincere"
            >
              Upload
            </button>
          </div>
        )}

        {template === 'sales' && (
          <>
            {/* Hidden input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onUploadChange}
              className="hidden"
            />

            {/* Faux input + buttons */}
            <div
              className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mt-4"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <div
                className={`input flex items-center justify-between cursor-pointer ${dragOver ? 'ring-2 ring-[#F7941D]/50' : ''}`}
                title="Import or drag a file here"
                onClick={onClickUpload}
              >
                <span className={`text-gray-400 select-none ${salesDocName ? '!text-gray-700 truncate' : ''}`}>
                  {salesDocName ? salesDocName : 'Import or drag a file here'}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-brand"
                onClick={onClickUpload}
                disabled={processing}
                title="Import a document (any common format)"
              >
                {processing ? 'Processing…' : 'Import CV'}
              </button>

              {/* Upload (Sales) */}
              <button
                type="button"
                className="btn btn-grey"
                disabled={!salesEditorHtml.trim()}
                onClick={() => {
                  const baseName = (candidateName || form.name || 'CV').replace(/\s+/g, '')
                  const defaultName = salesDocName?.trim()
                    ? salesDocName.replace(/\.(doc|docx|pdf)$/i, '.pdf')
                    : `${baseName}_Sales.pdf`
                  setUploadFileName(defaultName)
                  setUploadContext('sales')
                  setUploadCandidateId(candidateId || '') // prefill if available, editable in modal
                  setUploadErr(null)
                  setUploadSuccess(null)
                  setShowUploadModal(true)
                }}
                title="Convert edited Sales CV to PDF and upload to Vincere"
              >
                Upload
              </button>
            </div>

            {salesErr && <div className="mt-3 text-xs text-red-600">{String(salesErr).slice(0, 300)}</div>}
          </>
        )}

        {error && <div className="mt-3 text-xs text-red-600">{String(error).slice(0, 300)}</div>}
      </div>

      {/* CONTENT GRID */}
      <div className={`grid gap-4 ${template === 'sales' ? '' : 'md:grid-cols-2'}`}>
        {/* SALES: editable left card */}
        {template === 'sales' && (
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="font-semibold">Sales CV (editable)</div>
              <div className="text-xs text-gray-500">Edit content below. Use “Auto-redact” to remove contacts.</div>
            </div>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                className="btn btn-grey"
                onClick={() => setSalesEditorHtml(s => autoRedactContacts(s))}
              >
                Auto-redact contact details
              </button>
            </div>

            <div
              ref={salesEditorRef}
              className="prose max-w-none border rounded-lg p-3 bg-white min-h-[40vh] focus:outline-none"
              contentEditable
              suppressContentEditableWarning
              onInput={e => setSalesEditorHtml((e.target as HTMLDivElement).innerHTML)}
              dangerouslySetInnerHTML={{ __html: salesEditorHtml || '<p>Drop or import a CV to start editing…</p>' }}
            />
          </div>
        )}

        {/* RIGHT: preview always renders here; on Sales it's full-width */}
        <div className="card p-0 overflow-hidden">
          <CVTemplatePreview />
        </div>
      </div>

      {/* ===== Upload modal ===== */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          {/* If we have success, show a separate success popup that replaces the previous window */}
          {uploadSuccess ? (
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl text-center">
              <div className="text-2xl mb-2 text-green-600">Upload Successful</div>
              <p className="text-[12px] text-gray-600">
                {uploadContext === 'standard'
                  ? `File uploaded for Candidate ID ${candidateId || '—'}.`
                  : `File uploaded for Candidate ID ${uploadCandidateId || '—'}.`}
              </p>
              <div className="mt-6">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-zinc-900 text-white"
                  onClick={() => { setShowUploadModal(false); setUploadSuccess(null) }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4">
                <h3 className="text-base font-semibold">Upload CV to Vincere</h3>

                {/* Header summary only for Standard; Sales shows manual ID field below */}
                {uploadContext === 'standard' && (
                  <p className="text-[12px] text-gray-600">
                    Candidate: <span className="font-medium">{candidateName || form.name || 'Unknown'}</span> · ID:{' '}
                    <span className="font-mono">{candidateId || '—'}</span>
                  </p>
                )}

                <p className="text-[11px] text-gray-500 mt-1">
                  Source:&nbsp;
                  {uploadContext === 'standard' ? 'Standard (right-panel template → PDF)' : 'Sales (edited HTML → PDF)'}
                </p>
              </div>

              <div className="space-y-4">
                {/* Manual Candidate ID entry for Sales */}
                {uploadContext === 'sales' && (
                  <div>
                    <label className="block text-[12px] font-medium">Candidate ID</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border p-2 text-[13px]"
                      value={uploadCandidateId}
                      onChange={(e) => setUploadCandidateId(e.target.value)}
                      placeholder="Type Candidate ID used in Vincere"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[12px] font-medium">File name</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border p-2 text-[13px]"
                    value={uploadFileName}
                    onChange={(e) => setUploadFileName(e.target.value)}
                    placeholder="e.g. JohnSmith_CV.pdf"
                  />
                </div>

                {uploadErr && <div className="text-[12px] text-red-600">{uploadErr}</div>}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border"
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploadBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-zinc-900 text-white disabled:opacity-50"
                  onClick={confirmUpload}
                  disabled={
                    uploadBusy ||
                    !uploadFileName.trim() ||
                    (uploadContext === 'sales' && !uploadCandidateId.trim())
                  }
                >
                  {uploadBusy ? 'Uploading…' : 'Confirm & Upload'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ===== Sales helpers (sanitisation & redaction) ===== */
function sanitiseHtml(html: string): string {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
}
function autoRedactContacts(html: string): string {
  let out = html
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
  out = out.replace(/\b0\s*\d(?:[\s-]?\d){9}\b/gi, '[redacted]') // UK 11-digit variants
  out = out.replace(/\bhttps?:\/\/[^\s<]+/gi, '[redacted]')
  return out
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

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
const BASE64_THRESHOLD_BYTES = 3 * 1024 * 1024 // ~3 MB (safe for serverless body limits)

// ---- brand assets (served from /public) ----
const LOGO_PATH = '/zitko-full-logo.png'

// ===================== PDF BAKING =====================
async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch asset: ${url}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Paints a white strip + Zitko logo at the top of the FIRST page,
 * and a white strip + 3 lines of footer text at the bottom of the LAST page.
 *
 * Does not modify content flow — just overlays (non-destructive).
 */
async function bakeHeaderFooter(input: Blob): Promise<Blob> {
  // Only attempt baking on PDFs
  if (input.type && !/pdf/i.test(input.type)) return input

  try {
    const srcBuf = await input.arrayBuffer()
    const pdfDoc = await PDFDocument.load(srcBuf, { ignoreEncryption: true })

    const pages = pdfDoc.getPages()
    if (!pages.length) return input

    const first = pages[0]
    const last = pages[pages.length - 1]

    const logoBytes = await fetchBytes(LOGO_PATH)
    const logo = await pdfDoc.embedPng(logoBytes)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    // ---- Header (first page only) ----
    {
      const w = first.getWidth()
      const h = first.getHeight()
      const margin = 18 // pts
      const stripHeight = 70 // pts – enough to cover any existing header
      // Paint a white strip to "cover" any original header
      first.drawRectangle({
        x: 0, y: h - stripHeight, width: w, height: stripHeight, color: rgb(1, 1, 1)
      })
      // Logo on the right
      const maxLogoW = Math.min(170, w * 0.28)
      const scale = maxLogoW / logo.width
      const logoW = maxLogoW
      const logoH = logo.height * scale
      first.drawImage(logo, {
        x: w - logoW - margin,
        y: h - logoH - (stripHeight - logoH) / 2, // vertically within strip
        width: logoW,
        height: logoH
      })
    }

    // ---- Footer (last page only) ----
    {
      const w = last.getWidth()
      const marginX = 28
      const stripHeight = 54 // slim to avoid overlapping body text
      // White strip across the bottom
      last.drawRectangle({ x: 0, y: 0, width: w, height: stripHeight, color: rgb(1, 1, 1) })

      const footerLines = [
        'Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Consulting Ltd, Zitko Sales Ltd, Zitko Contracting Ltd and Zitko Talent',
        'Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL',
        'Tel: 01480 473245  Web: www.zitkogroup.com',
      ]

      const fontSize = 8.5
      const lineGap = 2
      let y = 10 // start a little above the bottom

      footerLines.forEach((line) => {
        const textWidth = font.widthOfTextAtSize(line, fontSize)
        const x = Math.max(marginX, (w - textWidth) / 2) // center, but never hug the edge
        last.drawText(line, { x, y, size: fontSize, font, color: rgb(0.97, 0.58, 0.11) }) // Zitko orange-ish
        y += fontSize + lineGap
      })
    }

    // Save -> Blob (handle TS/DOM typing differences safely)
    const out = await pdfDoc.save() // Uint8Array
    const outBuf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
    return new Blob([outBuf], { type: 'application/pdf' })
  } catch (err) {
    console.warn('Baking header/footer failed, using original PDF', err)
    return input // fail-safe
  }
}

export default function CvTab({ templateFromShell }: { templateFromShell?: TemplateKey }): JSX.Element {
  // ========== UI state ==========
  const [template, setTemplate] = useState<TemplateKey | null>(templateFromShell ?? null)
  const [candidateId, setCandidateId] = useState<string>('') // used by Standard & Sales (target for upload)
  const [candidateName, setCandidateName] = useState<string>('') // populated after retrieve (Standard) or manual if needed
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

  // ===== Upload modal (both Standard & Sales) =====
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadContext, setUploadContext] = useState<'standard' | 'sales'>('standard')
  const [uploadFileName, setUploadFileName] = useState<string>('CV.pdf')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  // Standard preview ref (for DOM→PDF export)
  const standardPreviewRef = useRef<HTMLDivElement | null>(null)
  const footerRef = useRef<HTMLDivElement | null>(null)

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

      // Try POST first, fall back to GET with query if needed
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

      // ---- Robust Custom Fields mapping ----
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

      setOpen({
        core: true, profile: false, skills: false, work: false, education: false, extra: false,
        rawCandidate: false, rawWork: false, rawEdu: false, rawCustom: false
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to retrieve data')
    } finally {
      setLoading(false)
    }
  }

  // ====================== SALES ( + PDF/DOCX handling ) ======================
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [salesErr, setSalesErr] = useState<string | null>(null)
  const [salesDocUrl, setSalesDocUrl] = useState<string | null>(null)  // object URL (preview/use)
  const [salesDocName, setSalesDocName] = useState<string>('')         // filename (final/derived)
  const [salesDocType, setSalesDocType] = useState<string>('')         // mime type
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

    console.log('[CLIENT] calling /api/upload', { desiredName, size: file.size })
    const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' })

    let data: any = null
    const text = await res.text()
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
    console.log('[CLIENT] /api/upload response', { status: res.status, data })

    if (!res.ok || !data?.ok || !data?.url) {
      throw new Error((data && (data.error || data.raw)) || `Blob upload failed (${res.status})`)
    }
    return data.url as string
  }

  async function postBase64ToVincere(fileName: string, base64: string) {
    const payload = { file_name: fileName, document_type_id: 1, base_64_content: base64, original_cv: true }
    console.log('[CLIENT] POST base64 to Vincere', { len: base64.length, fileName })

    const res = await fetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}/file`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
    })

    const raw = await res.text()
    let data: any = null
    try { data = raw ? JSON.parse(raw) : {} } catch { data = { raw } }
    console.log('[CLIENT] Vincere base64 response', { status: res.status, data })

    if (!res.ok || !data?.ok) throw new Error(data?.error || data?.raw || `Upload to Vincere failed (${res.status})`)
  }

  async function postFileUrlToVincere(fileName: string, publicUrl: string) {
    const payload = { file_name: fileName, document_type_id: 1, url: publicUrl, original_cv: true }
    console.log('[CLIENT] POST url to Vincere', { fileName, publicUrl })

    const res = await fetch(`/api/vincere/candidate/${encodeURIComponent(candidateId)}/file`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
    })

    const raw = await res.text()
    let data: any = null
    try { data = raw ? JSON.parse(raw) : {} } catch { data = { raw } }
    console.log('[CLIENT] Vincere URL response', { status: res.status, data })

    if (!res.ok || !data?.ok) throw new Error(data?.error || data?.raw || `Upload to Vincere failed (${res.status})`)
  }

  // Handle a selected/dropped file for SALES
  async function handleFile(f: File) {
  setSalesErr(null)
  if (salesDocUrl) URL.revokeObjectURL(salesDocUrl)

  const isPdfFile = f.type?.includes('pdf') || /\.pdf$/i.test(f.name)
  const isDocx    = f.type?.includes('officedocument.wordprocessingml.document') || /\.docx$/i.test(f.name)

  try {
    setProcessing(true)

    let pdfBlob: Blob | null = null

    if (isDocx) {
      // Convert DOCX → PDF for preview only (no baking here)
      const fd = new FormData()
      fd.append('file', f, f.name)

      const res = await fetch('/api/cloudconvert/docx-to-pdf', { method: 'POST', body: fd })
      if (!res.ok) {
        let msg = `DOCX convert failed (${res.status})`
        try {
          const j = await res.json()
          if (j?.error) msg = j.error
        } catch {}
        throw new Error(msg)
      }

      const pdfBuf = await res.arrayBuffer()
      pdfBlob = new Blob([pdfBuf], { type: 'application/pdf' })
    } else if (isPdfFile) {
      // Use the raw PDF as-is for preview
      pdfBlob = f
    } else {
      // Unsupported for preview
      const url = URL.createObjectURL(f)
      setSalesDocUrl(url)
      setSalesDocName(f.name)
      setSalesDocType(f.type || 'application/octet-stream')
      setSalesErr('Preview only supports PDF (DOCX will auto-convert). This file type will not preview.')
      return
    }

    // 👉 No baking for preview
    const url = URL.createObjectURL(pdfBlob)
    setSalesDocUrl(url)
    setSalesDocName(isDocx ? f.name.replace(/\.docx$/i, '.pdf') : f.name)
    setSalesDocType('application/pdf')
  } catch (e: any) {
    setSalesErr(e?.message || 'Failed to process file')
  } finally {
    setProcessing(false)
  }
}

      // 🔥 Bake header (p1) + footer (last) for preview as well
      const baked = await bakeHeaderFooter(pdfBlob)

      const url = URL.createObjectURL(baked)
      setSalesDocUrl(url)
      setSalesDocName((isDocx ? f.name.replace(/\.docx$/i, '.pdf') : f.name))
      setSalesDocType('application/pdf')
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

  const isPdf = useMemo(
    () => (salesDocType?.includes('pdf') || /\.pdf$/i.test(salesDocName)),
    [salesDocType, salesDocName]
  )

  // STANDARD: export right-panel DOM to PDF and upload (base64 for small; URL for large)
  async function uploadStandardPreviewToVincereUrl(finalName: string) {
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

    // 🔥 Bake first/last pages
    const baked = await bakeHeaderFooter(pdfBlob)

    if (baked.size <= BASE64_THRESHOLD_BYTES) {
      const base64 = await blobToBase64(baked)
      await postBase64ToVincere(finalName, base64)
    } else {
      const publicUrl = await uploadBlobToPublicUrl(baked, finalName)
      await postFileUrlToVincere(finalName, publicUrl)
    }
  }

  // SALES: upload whichever was imported (always a baked PDF in this flow)
  async function uploadSalesFileToVincereUrl(finalName: string) {
    if (!salesDocUrl) throw new Error('No Sales document to upload')
    const res = await fetch(salesDocUrl)
    if (!res.ok) throw new Error(`Failed to read Sales file (${res.status})`)
    const buf = await res.arrayBuffer()
    const blob = new Blob([buf], { type: salesDocType || 'application/pdf' })

    // 🔥 Ensure baked (in case a different code path set salesDocUrl)
    const baked = await bakeHeaderFooter(blob)

    if (baked.size <= BASE64_THRESHOLD_BYTES) {
      const base64 = await blobToBase64(baked)
      await postBase64ToVincere(finalName, base64)
    } else {
      const publicUrl = await uploadBlobToPublicUrl(baked, finalName)
      await postFileUrlToVincere(finalName, publicUrl)
    }
  }

  async function confirmUpload() {
    try {
      setUploadBusy(true)
      setUploadErr(null)
      if (!candidateId) throw new Error('No candidate selected')
      if (!uploadFileName?.trim()) throw new Error('Please enter a file name')

      let finalName = uploadFileName.trim()
      // Ensure sensible default extension (we always upload PDF after baking)
      if (!/\.pdf$/i.test(finalName)) finalName += '.pdf'

      console.log('[CLIENT] confirmUpload', { uploadContext, finalName, candidateId })

      if (uploadContext === 'standard') {
        await uploadStandardPreviewToVincereUrl(finalName)
      } else {
        await uploadSalesFileToVincereUrl(finalName)
      }

      setShowUploadModal(false)
    } catch (e: any) {
      setUploadErr(e?.message || 'Upload failed')
    } finally {
      setUploadBusy(false)
    }
  }

  // Branded viewer card (Sales)
  function SalesViewerCard() {
    return (
      <div className="border rounded-2xl overflow-hidden bg-white">
        {/* Branded Header (Viewer chrome – the real header is baked in the PDF itself) */}
        <div className="w-full bg-white px-4 py-3 flex items-center justify-end border-b">
          <img src="/zitko-full-logo.png" alt="Zitko" className="h-10" />
        </div>

        {/* Document area */}
        {salesDocUrl ? (
          isPdf ? (
            <iframe className="w-full h-[75vh] bg-white" src={salesDocUrl} title={salesDocName || 'Document'} />
          ) : (
            <div className="p-6 text-xs text-gray-600 bg-white">
              Preview not available for this file type. You can still upload it.
            </div>
          )
        ) : (
          <div className="p-6 text-xs text-gray-600 bg-white">
            No document imported yet. Use “Import CV” above.
          </div>
        )}

        {/* Footer (Viewer chrome – final footer is baked on last page of the PDF) */}
        <div className="w-full bg-white px-4 py-3 border-t text-center text-[10px] leading-snug text-[#F7941D]">
          <div>Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Consulting Ltd, Zitko Sales Ltd, Zitko Contracting Ltd and Zitko Talent</div>
          <div>Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL</div>
          <div>Tel: 01480 473245 Web: www.zitkogroup.com</div>
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

    // Standard (editor preview) — attach ref for DOM→PDF
    return (
      <div ref={standardPreviewRef} className="p-6 cv-standard-page bg-white text-[13px] leading-[1.35]">
        <div className="flex items-start justify-between">
          <div />
          <img src="/zitko-full-logo.png" alt="Zitko" className="h-10" />
        </div>

        <h1 className="text-2xl font-bold mt-5">Curriculum Vitae</h1>

        <div className="mt-2 text-[12px] text-gray-800 space-y-0.5">
          <div><span className="font-semibold">Name:</span> {form.name ? `${form.name}` : '—'}</div>
          <div><span className="font-semibold">Location:</span> {form.location ? `${form.location}` : '—'}</div>
        </div>

        <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">Profile</h2>
        <div className="whitespace-pre-wrap text-[12px]">{form.profile?.trim() ? form.profile : 'No Profile yet'}</div>

        <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">Key Skills</h2>
        <div className="whitespace-pre-wrap text-[12px]">
          {(() => {
            const items = (form.keySkills || '').split(/\r?\n|,\s*/).map(s => s.trim()).filter(Boolean)
            if (items.length === 0) return 'No Key Skills yet'
            return items.map((s, i) => <div key={i}>• {s}</div>)
          })()}
        </div>

        <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">Employment History</h2>
        <div className="space-y-3">
          {form.employment.length === 0 ? (
            <div className="text-gray-500 text-[12px]">No employment history yet.</div>
          ) : (
            form.employment.map((e, i) => {
              const range = [e.start, e.end].filter(Boolean).join(' to ')
              return (
                <div key={i} className="flex justify-between break-inside-avoid">
                  <div>
                    <div className="font-medium">{e.title || 'Role'}</div>
                    <div className="text-[11px] text-gray-500">{e.company}</div>
                    {e.description?.trim() && <div className="text-[12px] mt-1 whitespace-pre-wrap">{e.description}</div>}
                  </div>
                  <div className="text-[11px] text-gray-500 whitespace-nowrap">{range}</div>
                </div>
              )
            })
          )}
        </div>

        <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">Education & Qualifications</h2>
        <div className="space-y-3">
          {form.education.length === 0 ? (
            <div className="text-gray-500 text-[12px]">No education yet.</div>
          ) : (
            form.education.map((e, i) => {
              const range = [e.start, e.end].filter(Boolean).join(' to ')
              const showInstitutionLine = !!e.institution && !!e.course && e.course.trim().toLowerCase() !== e.institution.trim().toLowerCase()
              return (
                <div key={i} className="flex justify-between break-inside-avoid">
                  <div>
                    <div className="font-medium">{e.course || e.institution || 'Course'}</div>
                    {showInstitutionLine && <div className="text-[11px] text-gray-500">{e.institution}</div>}
                  </div>
                  <div className="text-[11px] text-gray-500 whitespace-nowrap">{range}</div>
                </div>
              )
            })
          )}
        </div>

        <h2 className="text-base md:text-lg font-semibold text-[#F7941D] mt-5 mb-2">Additional Information</h2>
        <div className="text-[12px] grid gap-1">
          <div>Driving License: {form.additional.drivingLicense || '—'}</div>
          <div>Nationality: {form.additional.nationality || '—'}</div>
          <div>Availability: {form.additional.availability || '—'}</div>
          <div>Health: {form.additional.health || '—'}</div>
          <div>Criminal Record: {form.additional.criminalRecord || '—'}</div>
          <div>Financial History: {form.additional.financialHistory || '—'}</div>
        </div>

        {/* Force the footer onto a clean page */}
        <div className="pdf-break-before" />

        <div ref={footerRef} className="mt-6 pt-4 border-t text-center text-[10px] leading-snug text-[#F7941D] break-inside-avoid cv-footer">
          <div>Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Group Inc</div>
          <div>Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL</div>
          <div>Tel: 01480 473245 Web: www.zitkogroup.com</div>
        </div>
      </div>
    )
  }

  // ========== render ==========
  return (
    <div className="grid gap-4">
      {/* Minimal print + PDF styles */}
      <style jsx global>{`
        /* Printing */
        @media print {
          @page { size: A4; margin: 12mm; }
          .cv-standard-page { width: 100%; }
          .cv-standard-page h1,
          .cv-standard-page h2,
          .cv-standard-page section { break-inside: avoid; page-break-inside: avoid; }
          .pdf-break-before { break-before: page; page-break-before: always; }
          .cv-footer { break-inside: avoid; page-break-inside: avoid; }
        }
        /* Screen/html2pdf hints (respected by html2pdf pagebreak: 'css') */
        .pdf-break-before { break-before: page; page-break-before: always; height: 1px; }
        .cv-standard-page .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
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
              title="Sales template: import a CV (PDF/DOCX)"
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
                title="Import a PDF or Word (DOC/DOCX) document"
              >
                {processing ? 'Processing…' : 'Import CV'}
              </button>

              {/* Upload (Sales) */}
              <button
                type="button"
                className="btn btn-grey"
                disabled={!candidateId || !salesDocUrl}
                onClick={() => {
                  const baseName = (candidateName || form.name || 'CV').replace(/\s+/g, '')
                  const defaultName = salesDocName?.trim()
                    ? salesDocName.replace(/\.(doc|docx)$/i, '.pdf')
                    : `${baseName}_Sales.pdf`
                  setUploadFileName(defaultName)
                  setUploadContext('sales')
                  setShowUploadModal(true)
                }}
                title="Upload the imported file to Vincere"
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
        {template === 'standard' && (
          <div className="card p-4 space-y-4">
            {/* Standard editor */}
            {/* Core */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Core Details</h3>
                <div className="flex items-center gap-3">
                  <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => toggle('core')}>
                    {open.core ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {open.core && (
                <div className="grid gap-3 mt-3">
                  <label className="grid gap-1">
                    <span className="text-[11px] text-gray-500">Name</span>
                    <input
                      className="input"
                      value={form.name}
                      onChange={e => {
                        setField('name', e.target.value)
                        setCandidateName(e.target.value)
                      }}
                      disabled={loading}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11px] text-gray-500">Location</span>
                    <input className="input" value={form.location} onChange={e => setField('location', e.target.value)} disabled={loading} />
                  </label>
                </div>
              )}
            </section>

            {/* Profile */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Profile</h3>
                <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => toggle('profile')}>
                  {open.profile ? 'Hide' : 'Show'}
                </button>
              </div>
              {open.profile && (
                <div className="mt-3">
                  <div className="flex flex-col sm:flex-row gap-2 mb-3 items-stretch sm:items-center">
                    <button
                      type="button"
                      className="btn btn-grey text-[11px] !px-3 !py-1.5 w-36 whitespace-nowrap"
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
                      className="btn btn-grey text-[11px] !px-3 !py-1.5 w-36 whitespace-nowrap"
                      disabled={loading || !rawCandidate || !jobId}
                      onClick={generateJobProfile}
                      title={!jobId ? 'Enter a Job ID' : 'Generate job-tailored profile'}
                    >
                      Generate for Job
                    </button>
                  </div>

                  <label className="grid gap-1">
                    <span className="text-[11px] text-gray-500">Profile</span>
                    <textarea className="input min-h-[120px]" value={form.profile} onChange={e => setField('profile', e.target.value)} disabled={loading} />
                  </label>
                </div>
              )}
            </section>

            {/* Key Skills */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Key Skills</h3>
                <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => toggle('skills')}>
                  {open.skills ? 'Hide' : 'Show'}
                </button>
              </div>
              {open.skills && (
                <label className="grid gap-1 mt-3">
                  <span className="text-[11px] text-gray-500">Key Skills (comma or newline)</span>
                  <textarea className="input min-h-[100px]" value={form.keySkills} onChange={e => setField('keySkills', e.target.value)} disabled={loading} />
                </label>
              )}
            </section>

            {/* Employment */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Employment History</h3>
                <div className="flex items-center gap-3">
                  <button type="button" className="text-[11px] text-gray-500 underline" onClick={addEmployment} disabled={loading}>Add role</button>
                  <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => toggle('work')}>
                    {open.work ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {open.work && (
                <div className="grid gap-3 mt-3">
                  {form.employment.length === 0 ? (
                    <div className="text-[12px] text-gray-500">No employment history yet.</div>
                  ) : (
                    form.employment.map((e, i) => (
                      <div key={i} className="border rounded-xl p-3 grid gap-2">
                        <label className="grid gap-1">
                          <span className="text-[11px] text-gray-500">Title</span>
                          <input className="input" value={e.title || ''} onChange={ev => {
                            const v = ev.target.value
                            setForm(prev => { const copy = structuredClone(prev); copy.employment[i].title = v; return copy })
                          }} />
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="grid gap-1">
                            <span className="text-[11px] text-gray-500">Company</span>
                            <input className="input" value={e.company || ''} onChange={ev => {
                              const v = ev.target.value
                              setForm(prev => { const copy = structuredClone(prev); copy.employment[i].company = v; return copy })
                            }} />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-gray-500">Start</span>
                              <input className="input" value={e.start || ''} onChange={ev => {
                                const v = ev.target.value
                                setForm(prev => { const copy = structuredClone(prev); copy.employment[i].start = v; return copy })
                              }} />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-[11px] text-gray-500">End</span>
                              <input className="input" value={e.end || ''} onChange={ev => {
                                const v = ev.target.value
                                setForm(prev => { const copy = structuredClone(prev); copy.employment[i].end = v; return copy })
                              }} />
                            </label>
                          </div>
                        </div>
                        <label className="grid gap-1">
                          <span className="text-[11px] text-gray-500">Description</span>
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
                <h3 className="font-semibold text-sm">Education & Qualifications</h3>
                <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => toggle('education')}>
                  {open.education ? 'Hide' : 'Show'}
                </button>
              </div>

              {open.education && (
                <div className="grid gap-3 mt-3">
                  {form.education.length === 0 ? (
                    <div className="text-[12px] text-gray-500">No education yet.</div>
                  ) : (
                    form.education.map((e, i) => (
                      <div key={i} className="flex items-start justify-between">
                        <div className="grid gap-0.5">
                          <div className="font-medium">{e.course || e.institution || 'Course'}</div>
                          {!!e.institution && !!e.course && e.course.trim().toLowerCase() !== e.institution.trim().toLowerCase() && (
                            <div className="text-[11px] text-gray-500">{e.institution}</div>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 whitespace-nowrap">{[e.start, e.end].filter(Boolean).join(' to ')}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>

            {/* Additional */}
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Additional Information</h3>
                <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => toggle('extra')}>
                  {open.extra ? 'Hide' : 'Show'}
                </button>
              </div>

              {open.extra && (
                <div className="text-[12px] grid gap-1 mt-3">
                  <div>Driving License: {form.additional.drivingLicense || '—'}</div>
                  <div>Nationality: {form.additional.nationality || '—'}</div>
                  <div>Availability: {form.additional.availability || '—'}</div>
                  <div>Health: {form.additional.health || '—'}</div>
                  <div>Criminal Record: {form.additional.criminalRecord || '—'}</div>
                  <div>Financial History: {form.additional.financialHistory || '—'}</div>
                </div>
              )}
            </section>

            {/* Debug: Raw JSON */}
            <section>
              <div className="mt-2 border rounded-xl p-2 bg-gray-50">
                <div className="text-[10px] font-semibold text-gray-600 mb-1">Raw JSON Data (debug)</div>

                {/* Candidate Data */}
                <div className="border rounded-lg mb-2">
                  <div className="flex items-center justify-between px-2 py-1">
                    <div className="text-[10px] font-medium">Candidate Data</div>
                    <button type="button" className="text-[10px] text-gray-500 underline" onClick={() => toggle('rawCandidate')}>
                      {open.rawCandidate ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {open.rawCandidate && (
                    <pre className="text-[10px] leading-tight bg-white border-t rounded-b-lg p-2 max-h-64 overflow-auto">
{JSON.stringify(rawCandidate, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Work Experience */}
                <div className="border rounded-lg mb-2">
                  <div className="flex items-center justify-between px-2 py-1">
                    <div className="text-[10px] font-medium">Work Experience</div>
                    <button type="button" className="text-[10px] text-gray-500 underline" onClick={() => toggle('rawWork')}>
                      {open.rawWork ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {open.rawWork && (
                    <pre className="text-[10px] leading-tight bg-white border-t rounded-b-lg p-2 max-h-64 overflow-auto">
{JSON.stringify(rawWork, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Education Details */}
                <div className="border rounded-lg mb-2">
                  <div className="flex items-center justify-between px-2 py-1">
                    <div className="text-[10px] font-medium">Education Details</div>
                    <button type="button" className="text-[10px] text-gray-500 underline" onClick={() => toggle('rawEdu')}>
                      {open.rawEdu ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {open.rawEdu && (
                    <pre className="text-[10px] leading-tight bg-white border-t rounded-b-lg p-2 max-h-64 overflow-auto">
{JSON.stringify(rawEdu, null, 2)}
                    </pre>
                  )}
                </div>

                {/* Custom Fields */}
                <div className="border rounded-lg">
                  <div className="flex items-center justify-between px-2 py-1">
                    <div className="text-[10px] font-medium">Custom Fields</div>
                    <button type="button" className="text-[10px] text-gray-500 underline" onClick={() => toggle('rawCustom')}>
                      {open.rawCustom ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {open.rawCustom && (
                    <pre className="text-[10px] leading-tight bg-white border-t rounded-b-lg p-2 max-h-64 overflow-auto">
{JSON.stringify(rawCustom, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </section>
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
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4">
              <h3 className="text-base font-semibold">Upload CV to Vincere</h3>
              <p className="text-[12px] text-gray-600">
                Candidate: <span className="font-medium">{candidateName || form.name || 'Unknown'}</span> · ID:{' '}
                <span className="font-mono">{candidateId || '—'}</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Source:&nbsp;
                {uploadContext === 'standard' ? 'Standard (right-panel template → PDF)' : 'Sales (imported file)'}
              </p>
            </div>

            <div className="space-y-4">
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
                disabled={uploadBusy}
              >
                {uploadBusy ? 'Uploading…' : 'Confirm & Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

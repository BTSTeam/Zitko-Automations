'use client'

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

/** ==============================
 * CvUtils.ts
 * Shared helpers for CV formatting
 * - Used by UkFormat, UsFormat, and SalesFormat
 * - Contains identical logic from CvTab.tsx
 * ============================== */

// === Size threshold for choosing base64 vs URL ===
export const BASE64_THRESHOLD_BYTES = 3 * 1024 * 1024 // ~3 MB

// ---- brand assets (served from /public) ----
const LOGO_PATH = '/zitko-full-logo.png'

// ===================== PDF BAKING (Sales only) =====================
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const absolute = new URL(url, window.location.origin).toString()
  const res = await fetch(absolute)
  if (!res.ok) throw new Error(`Failed to fetch asset: ${absolute}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Paints a white strip + Zitko logo at the top of the FIRST page,
 * and a white strip + 3 lines of footer text at the bottom of the LAST page.
 * (Used for Sales uploads & preview)
 */
export async function bakeHeaderFooter(input: Blob): Promise<Blob> {
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

    // Header
    {
      const w = first.getWidth()
      const h = first.getHeight()
      const margin = 18
      const stripHeight = 70
      first.drawRectangle({ x: 0, y: h - stripHeight, width: w, height: stripHeight, color: rgb(1, 1, 1) })
      const maxLogoW = Math.min(170, w * 0.28)
      const scale = maxLogoW / logo.width
      const logoW = maxLogoW
      const logoH = logo.height * scale
      first.drawImage(logo, {
        x: w - logoW - margin,
        y: h - logoH - (stripHeight - logoH) / 2,
        width: logoW,
        height: logoH,
      })
    }

    // Footer
    {
      const w = last.getWidth()
      const marginX = 28
      const stripHeight = 54
      last.drawRectangle({ x: 0, y: 0, width: w, height: stripHeight, color: rgb(1, 1, 1) })
      const footerLines = [
        'Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Inc',
        'Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL',
        'Tel: 01480 473245  Web: www.zitkogroup.com',
      ]
      const fontSize = 8.5
      const lineGap = 2
      const step = fontSize + lineGap
      const yTop = stripHeight - (fontSize + 10)
      footerLines.forEach((line, i) => {
        const textWidth = font.widthOfTextAtSize(line, fontSize)
        const x = Math.max(marginX, (w - textWidth) / 2)
        const y = yTop - i * step
        last.drawText(line, { x, y, size: fontSize, font, color: rgb(0.97, 0.58, 0.11) })
      })
    }

    const out = await pdfDoc.save()
    const outBuf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
    return new Blob([outBuf], { type: 'application/pdf' })
  } catch (err) {
    console.warn('Baking header/footer failed, using original PDF', err)
    return input
  }
}

// ---------- helpers for education/work mapping ----------
export function formatDate(dateStr?: string | null): string {
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

export function cleanRichTextToPlain(input: unknown): string {
  if (!input) return ''
  let s = String(input)
  s = s.replace(/<\s*br\s*\/?>/gi, '\n')
  s = s.replace(/<\/\s*p\s*>\s*<\s*p[^>]*>/gi, '\n')
  s = s.replace(/<\/?[^>]+>/g, '')
  if (typeof window !== 'undefined') {
    const ta = document.createElement('textarea')
    ta.innerHTML = s
    s = ta.value
  }
  s = s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return s
}

export type Employment = {
  title?: string
  company?: string
  start?: string
  end?: string
  description?: string
}

export type Education = {
  course?: string
  institution?: string
  start?: string
  end?: string
}

export function mapWorkExperiences(list: any[]): Employment[] {
  if (!Array.isArray(list)) return []
  return list.map((w) => {
    const start = formatDate(w?.work_from)
    const end = w?.work_to == null ? 'Present' : formatDate(w?.work_to)
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

export function mapEducation(list: any[]): Education[] {
  if (!Array.isArray(list)) return []
  return list.map(e => {
    const course = (e?.school_name || e?.institution || e?.school || '').toString().trim()
    const descriptionRaw = e?.description ?? ''
    const institution = cleanRichTextToPlain(descriptionRaw)
    const start = formatDate(e?.start_date || e?.from_date || e?.start) || ''
    const end = formatDate(e?.end_date || e?.to_date || e?.end) || ''
    return { course, institution, start, end }
  })
}

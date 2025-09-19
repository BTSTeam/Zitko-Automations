// app/api/convert/docx-to-pdf/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import * as mammoth from 'mammoth'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 })

    const name = (file as any).name || 'document.docx'
    if (!/\.docx$/i.test(name)) {
      return NextResponse.json(
        { ok: false, error: 'Only DOCX is supported for auto-conversion. Upload PDF or DOCX.' },
        { status: 415 }
      )
    }

    const buf = Buffer.from(await file.arrayBuffer())

    // DOCX -> HTML
    const { value: htmlBody } = await mammoth.convertToHtml({ buffer: buf })

    // Minimal HTML wrapper (tweak styles as needed)
    const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.5; color: #111; margin: 18mm; }
  h1,h2,h3 { color: #F7941D; }
</style>
</head>
<body>
${htmlBody}
</body></html>`

    // HTML -> PDF (headless Chrome)
    const executablePath = await chromium.executablePath()
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    })

    await browser.close()

    // ✅ FIX: wrap Uint8Array/Buffer in a Blob so the type is valid BodyInit
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })

    const outName = name.replace(/\.docx$/i, '.pdf')
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${outName}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Conversion failed' }, { status: 500 })
  }
}

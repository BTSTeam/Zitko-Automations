export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteer, { Browser } from 'puppeteer-core';  // 👈 add { Browser }
import * as mammoth from 'mammoth';

export async function POST(req: NextRequest) {
  let browser: Browser | null = null;

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 });
    }

    const originalName = (file as any).name || 'document.docx';
    if (!/\.docx$/i.test(originalName)) {
      return NextResponse.json(
        { ok: false, error: 'Only DOCX is supported for auto-conversion. Upload PDF or DOCX.' },
        { status: 415 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // DOCX → HTML
    const { value: htmlBody } = await mammoth.convertToHtml({ buffer: buf });
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.5; color: #111; margin: 0; }
    h1,h2,h3 { color: #F7941D; break-inside: avoid; }
    p, ul, ol, table { break-inside: avoid; }
    img { max-width: 100%; }
  </style>
</head>
<body>
${htmlBody}
</body>
</html>`;

    // Optional: ensure common fonts exist in headless env (safe no-ops if unsupported)
    // await chromium.font('https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Regular.ttf');

    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--font-render-hinting=none',
        '--disable-gpu',
        '--no-sandbox',
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ['domcontentloaded', 'networkidle0'] });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      preferCSSPageSize: true,
    });

    const outName = originalName.replace(/\.docx$/i, '.pdf');
    return new NextResponse(new Uint8Array(pdf).buffer, {
     status: 200,
     headers: {
       'Content-Type': 'application/pdf',
       'Content-Disposition': `inline; filename="${outName}"`,
       'Cache-Control': 'no-store',
       'X-Content-Type-Options': 'nosniff',
     },
   });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Conversion failed' }, { status: 500 });
  } finally {
    try { await browser?.close(); } catch {}
  }
}


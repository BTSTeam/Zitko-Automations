export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 });

    const name = (file as any).name || 'document.pdf';
    const isPdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(name);
    if (!isPdf) {
      return NextResponse.json({ ok: false, error: 'Only PDF files can be branded.' }, { status: 415 });
    }

    const inputBytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await PDFDocument.load(inputBytes);

    // Fetch logo from your public/ folder using the current host
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('host') ?? '';
    const logoUrl = `${proto}://${host}/zitko-full-logo.png`;
    const logoRes = await fetch(logoUrl);
    if (!logoRes.ok) throw new Error(`Failed to fetch logo (${logoRes.status})`);
    const logoBytes = new Uint8Array(await logoRes.arrayBuffer());

    // Try PNG first, fall back to JPEG if necessary
    let logoImage: any;
    try { logoImage = await pdf.embedPng(logoBytes); }
    catch { logoImage = await pdf.embedJpg(logoBytes); }

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const orange = rgb(0.9686, 0.5804, 0.1137); // #F7941D

    const footerLines = [
      'Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Consulting Ltd, Zitko Sales Ltd, Zitko Contracting Ltd and Zitko Talent',
      'Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL',
      'Zitko™ • www.zitkogroup.com • 01480 473245',
    ];

    const margin = 24;
    const maxLogoW = 120;
    const maxLogoH = 32;
    const fontSize = 8.5;
    const lineHeight = 11;

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();

      // Header logo (top-right)
      const scale = Math.min(maxLogoW / logoImage.width, maxLogoH / logoImage.height);
      const lw = logoImage.width * scale;
      const lh = logoImage.height * scale;
      page.drawImage(logoImage, {
        x: width - margin - lw,
        y: height - margin - lh,
        width: lw,
        height: lh,
      });

      // Footer (centered, 3 lines)
      footerLines.forEach((text, i) => {
        const tw = font.widthOfTextAtSize(text, fontSize);
        const x = Math.max(10, (width - tw) / 2);
        const y = margin + i * lineHeight;
        page.drawText(text, { x, y, size: fontSize, font, color: orange });
      });
    }

    const out = await pdf.save();
    const outName = name.replace(/\.pdf$/i, '') + '-branded.pdf';
    return new NextResponse(new Uint8Array(out).buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${outName}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Branding failed' }, { status: 500 });
  }
}

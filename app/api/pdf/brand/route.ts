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

    // fetch logo from /public
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('host') ?? '';
    const logoUrl = `${proto}://${host}/zitko-full-logo.png`;
    const logoRes = await fetch(logoUrl);
    if (!logoRes.ok) throw new Error(`Failed to fetch logo (${logoRes.status})`);
    const logoBytes = new Uint8Array(await logoRes.arrayBuffer());

    // embed resources
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let logoImage: any;
    try { logoImage = await pdf.embedPng(logoBytes); }
    catch { logoImage = await pdf.embedJpg(logoBytes); }

    // brand constants
    const orange = rgb(0.9686, 0.5804, 0.1137); // #F7941D
    const footerLines = [
      'Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Consulting Ltd, Zitko Sales Ltd, Zitko Contracting Ltd and Zitko Talent',
      'Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL',
      'Zitko™ • www.zitkogroup.com • 01480 473245',
    ];

    const margin = 18;      // page margin in points
    const pad = 6;          // padding around whiteout blocks
    const maxLogoW = 120;
    const maxLogoH = 32;
    const fontSize = 9;
    const lineHeight = 12;

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();

      // compute logo size & position (top-right)
      const s = Math.min(maxLogoW / logoImage.width, maxLogoH / logoImage.height);
      const lw = logoImage.width * s;
      const lh = logoImage.height * s;
      const logoX = width - margin - lw;
      const logoY = height - margin - lh;

      // ---- HEADER WHITENING (to avoid overlapping existing header) ----
      page.drawRectangle({
        x: logoX - pad,
        y: logoY - pad,
        width: lw + pad * 2,
        height: lh + pad * 2,
        color: rgb(1, 1, 1),
      });

      // draw logo
      page.drawImage(logoImage, { x: logoX, y: logoY, width: lw, height: lh });

      // ---- FOOTER WHITENING (full-width block) ----
      const footerBlockH = footerLines.length * lineHeight + pad * 2;
      const footerBaseY = margin;
      page.drawRectangle({
        x: 0,
        y: footerBaseY - pad,
        width,
        height: footerBlockH,
        color: rgb(1, 1, 1),
      });

      // Footer (centered)
      footerLines.forEach((text, i) => {
        const tw = font.widthOfTextAtSize(text, fontSize);
        const x = Math.max(10, (width - tw) / 2);
        const y = footerBaseY + i * lineHeight;
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

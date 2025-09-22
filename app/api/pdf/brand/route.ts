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

    // Load PDF
    const inputBytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await PDFDocument.load(inputBytes);

    // Pull logo from /public
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('host') ?? '';
    const logoUrl = `${proto}://${host}/zitko-full-logo.png`;
    const logoRes = await fetch(logoUrl);
    if (!logoRes.ok) throw new Error(`Failed to fetch logo (${logoRes.status})`);
    const logoBytes = new Uint8Array(await logoRes.arrayBuffer());

    // Resources
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let logoImage: any;
    try { logoImage = await pdf.embedPng(logoBytes); }
    catch { logoImage = await pdf.embedJpg(logoBytes); }

    // --- BRANDING CONSTANTS (tweak if needed) ---
    const ORANGE = rgb(0.9686, 0.5804, 0.1137); // #F7941D
    const MARGIN = 18;          // distance from edges for logo/text
    const HEADER_BLOCK_H = 60;  // full-width white bar height at top
    const FOOTER_LINE_H = 12;   // line height in footer
    const FOOTER_FONT_SIZE = 9; // footer font size
    const MAX_LOGO_W = 120;
    const MAX_LOGO_H = 32;

    const FOOTER_LINES = [
      'Zitko™ incorporates Zitko Group Ltd, Zitko Group (Ireland) Ltd, Zitko Consulting Ltd, Zitko Sales Ltd, Zitko Contracting Ltd and Zitko Talent',
      'Registered office – Suite 2, 17a Huntingdon Street, St Neots, Cambridgeshire, PE19 1BL',
      'Zitko™ • www.zitkogroup.com • 01480 473245',
    ];
    // --------------------------------------------

    const pages = pdf.getPages();

    pages.forEach((page, idx) => {
      const { width, height } = page.getSize();
      const isFirst = idx === 0;
      const isLast  = idx === pages.length - 1;

      // HEADER (first page only): full-width whiteout + logo right
      if (isFirst) {
        // Full-width white band at the top
        page.drawRectangle({
          x: 0,
          y: height - HEADER_BLOCK_H,
          width,
          height: HEADER_BLOCK_H,
          color: rgb(1, 1, 1),
        });

        // Logo placed inside that band (top-right)
        const scale = Math.min(MAX_LOGO_W / logoImage.width, MAX_LOGO_H / logoImage.height);
        const lw = logoImage.width * scale;
        const lh = logoImage.height * scale;

        page.drawImage(logoImage, {
          x: width - MARGIN - lw,
          y: height - MARGIN - lh,
          width: lw,
          height: lh,
        });
      }

      // FOOTER (last page only): white band + centered lines
      if (isLast) {
        const footerBlockH = FOOTER_LINES.length * FOOTER_LINE_H + 10; // little padding
        const baseY = MARGIN;

        // Full-width white band at the bottom
        page.drawRectangle({
          x: 0,
          y: 0,
          width,
          height: baseY + footerBlockH,
          color: rgb(1, 1, 1),
        });

        FOOTER_LINES.forEach((text, i) => {
          const tw = font.widthOfTextAtSize(text, FOOTER_FONT_SIZE);
          const x = Math.max(10, (width - tw) / 2);
          const y = baseY + i * FOOTER_LINE_H;
          page.drawText(text, { x, y, size: FOOTER_FONT_SIZE, font, color: ORANGE });
        });
      }
    });

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

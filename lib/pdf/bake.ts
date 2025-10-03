// lib/pdf/bake.ts
import { PDFDocument, StandardFonts, rgb, RGB } from 'pdf-lib'
import { ZITKO_BRAND } from '@/lib/branding'

// ... inside bakeHeaderFooter ...
  const ORANGE: RGB = ZITKO_BRAND.ORANGE
// ...
  drawHeader(first, { fontBold, logoImage, ORANGE })
  drawFooter(last, { font, ORANGE, footerLines })

// ---- helpers ----
function drawHeader(
  page: any,
  {
    fontBold,
    logoImage,
    ORANGE
  }: { fontBold: any; logoImage: any | null; ORANGE: RGB }
) {
  // ...
}

function drawFooter(
  page: any,
  {
    font,
    ORANGE,
    footerLines,
  }: { font: any; ORANGE: RGB; footerLines: string[] }
) {
  // ...
}

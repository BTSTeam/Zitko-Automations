// lib/pdf/bake.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { ZITKO_BRAND } from '@/lib/branding'

type BakeOptions = {
  template?: 'sales' | 'standard'
  /**
   * Optional raw PNG/JPEG bytes for the logo.
   * If not provided, we'll attempt to fetch from:
   *  1) process.env.ZITKO_LOGO_URL
   *  2) process.env.NEXT_PUBLIC_SITE_URL + ZITKO_BRAND.LOGO_PATH
   *  3) ZITKO_BRAND.LOGO_PATH (absolute path like /zitko-full-logo.png)
   */
  logoBytes?: ArrayBuffer
  /**
   * Optional footer lines override. Defaults to ZITKO_BRAND.FOOTER_LINES
   */
  footerLines?: string[]
}

/**
 * Bakes Zitko header/footer onto the given PDF bytes.
 * - Header on FIRST page only
 * - Footer on LAST page only
 * Returns fresh PDF bytes (Uint8Array).
 */
export async function bakeHeaderFooter(
  inputPdfBytes: ArrayBuffer,
  opts: BakeOptions = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(inputPdfBytes, { updateMetadata: false })
  const pages = pdfDoc.getPages()
  if (!pages.length) return new Uint8Array(inputPdfBytes)

  const first = pages[0]
  const last = pages[pages.length - 1]

  // Fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Colors & constants
  const ORANGE = ZITKO_BRAND.ORANGE
  const footerLines = opts.footerLines ?? ZITKO_BRAND.FOOTER_LINES

  // Try to embed the logo (optional; header will still draw even without it)
  const logoBytes = opts.logoBytes ?? (await tryGetLogoBytes())
  const logoImage = logoBytes ? await embedImage(pdfDoc, logoBytes) : null

  // Header on first page
  drawHeader(first, { fontBold, logoImage, ORANGE })

  // Footer on last page
  drawFooter(last, { font, ORANGE, footerLines })

  const out = await pdfDoc.save()
  return out
}

// ---- helpers ----

function drawHeader(
  page: any,
  {
    fontBold,
    logoImage,
    ORANGE
  }: { fontBold: any; logoImage: any | null; ORANGE: { r: number; g: number; b: number } }
) {
  const { width, height } = page.getSize()
  const bandHeight = 42

  // Orange band across the top
  page.drawRectangle({
    x: 0,
    y: height - bandHeight,
    width,
    height: bandHeight,
    color: ORANGE,
  })

  // Optional white logo on the band (left-aligned)
  if (logoImage) {
    // Scale to fit nicely within the band while preserving aspect ratio
    const maxLogoH = bandHeight - 10
    const scale = maxLogoH / logoImage.height
    const logoW = logoImage.width * scale
    const logoH = logoImage.height * scale
    const marginX = 16
    const marginY = (bandHeight - logoH) / 2

    page.drawImage(logoImage, {
      x: marginX,
      y: height - bandHeight + marginY,
      width: logoW,
      height: logoH,
    })
  }

  // (Optional) You could add a right-aligned label here if needed:
  // const label = 'Sales CV'
  // const fontSize = 10
  // const textWidth = fontBold.widthOfTextAtSize(label, fontSize)
  // page.drawText(label, {
  //   x: width - textWidth - 16,
  //   y: height - bandHeight + (bandHeight - fontSize) / 2,
  //   size: fontSize,
  //   font: fontBold,
  //   color: rgb(1, 1, 1),
  // })
}

function drawFooter(
  page: any,
  {
    font,
    ORANGE,
    footerLines,
  }: { font: any; ORANGE: { r: number; g: number; b: number }; footerLines: string[] }
) {
  const { width } = page.getSize()

  // Orange rule line near the bottom
  page.drawRectangle({
    x: 0,
    y: 32,
    width,
    height: 2,
    color: ORANGE,
  })

  // Footer text (small, centered)
  const fontSize = 8
  let y = 20
  for (const line of footerLines) {
    const textWidth = font.widthOfTextAtSize(line, fontSize)
    page.drawText(line, {
      x: (width - textWidth) / 2,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    })
    y -= 10
  }
}

async function embedImage(pdfDoc: PDFDocument, bytes: ArrayBuffer) {
  // Try PNG first, then JPEG
  try {
    return await pdfDoc.embedPng(bytes)
  } catch {
    return await pdfDoc.embedJpg(bytes)
  }
}

async function tryGetLogoBytes(): Promise<ArrayBuffer | null> {
  // Priority:
  // 1) Explicit env override
  const envUrl = process.env.ZITKO_LOGO_URL
  if (envUrl) {
    const res = await safeFetch(envUrl)
    if (res) return res
  }

  // 2) NEXT_PUBLIC_SITE_URL + LOGO_PATH
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  if (site && ZITKO_BRAND.LOGO_PATH) {
    const res = await safeFetch(`${site}${ZITKO_BRAND.LOGO_PATH}`)
    if (res) return res
  }

  // 3) Raw path (useful if running locally and path is absolute under /public)
  if (ZITKO_BRAND.LOGO_PATH?.startsWith('/')) {
    const origin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    const res = await safeFetch(`${origin}${ZITKO_BRAND.LOGO_PATH}`)
    if (res) return res
  }

  // If none worked, just return null (header still draws the band)
  return null
}

async function safeFetch(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

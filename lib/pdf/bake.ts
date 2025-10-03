// lib/pdf/bake.ts
import { PDFDocument, StandardFonts, rgb, RGB } from 'pdf-lib'
import { ZITKO_BRAND } from '@/lib/branding'

type BakeOptions = {
  template?: 'sales' | 'standard'
  logoBytes?: ArrayBuffer
  footerLines?: string[]
}

export async function bakeHeaderFooter(
  inputPdfBytes: ArrayBuffer,
  opts: BakeOptions = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(inputPdfBytes, { updateMetadata: false })
  const pages = pdfDoc.getPages()
  if (!pages.length) return new Uint8Array(inputPdfBytes)

  const first = pages[0]
  const last = pages[pages.length - 1]

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const ORANGE: RGB = ZITKO_BRAND.ORANGE
  const footerLines = opts.footerLines ?? ZITKO_BRAND.FOOTER_LINES

  const logoBytes = opts.logoBytes ?? (await tryGetLogoBytes())
  const logoImage = logoBytes ? await embedImage(pdfDoc, logoBytes) : null

  drawHeader(first, { fontBold, logoImage, ORANGE })
  drawFooter(last, { font, ORANGE, footerLines })

  const out = await pdfDoc.save()
  return out
}

// ---- helpers ----
function drawHeader(page: any, { fontBold, logoImage, ORANGE }: { fontBold: any; logoImage: any | null; ORANGE: RGB }) {
  const { width, height } = page.getSize()
  const bandHeight = 42
  page.drawRectangle({ x: 0, y: height - bandHeight, width, height: bandHeight, color: ORANGE })
  if (logoImage) {
    const maxLogoH = bandHeight - 10
    const scale = maxLogoH / logoImage.height
    const logoW = logoImage.width * scale
    const logoH = logoImage.height * scale
    page.drawImage(logoImage, { x: 16, y: height - bandHeight + (bandHeight - logoH) / 2, width: logoW, height: logoH })
  }
}

function drawFooter(page: any, { font, ORANGE, footerLines }: { font: any; ORANGE: RGB; footerLines: string[] }) {
  const { width } = page.getSize()
  page.drawRectangle({ x: 0, y: 32, width, height: 2, color: ORANGE })
  let y = 20
  for (const line of footerLines) {
    const fontSize = 8
    const textWidth = font.widthOfTextAtSize(line, fontSize)
    page.drawText(line, { x: (width - textWidth) / 2, y, size: fontSize, font, color: rgb(0, 0, 0) })
    y -= 10
  }
}

async function embedImage(pdfDoc: PDFDocument, bytes: ArrayBuffer) {
  try { return await pdfDoc.embedPng(bytes) } catch { return await pdfDoc.embedJpg(bytes) }
}

async function tryGetLogoBytes(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}${ZITKO_BRAND.LOGO_PATH}`)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch { return null }
}

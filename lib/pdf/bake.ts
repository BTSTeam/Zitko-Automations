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
  const ORANGE: RGB = ZITKO_BRAND.ORANGE
  const footerLines = opts.footerLines ?? ZITKO_BRAND.FOOTER_LINES

  // logo
  const logoBytes = opts.logoBytes ?? (await tryGetLogoBytes())
  const logoImage = logoBytes ? await embedImage(pdfDoc, logoBytes) : null

  drawHeader(first, { logoImage })
  drawFooter(last, { font, ORANGE, footerLines })

  return await pdfDoc.save()
}

// ---- helpers ----

function drawHeader(page: any, { logoImage }: { logoImage: any | null }) {
  const { height } = page.getSize()
  const bandHeight = 50

  // White band background
  page.drawRectangle({
    x: 0,
    y: height - bandHeight,
    width: page.getWidth(),
    height: bandHeight,
    color: rgb(1, 1, 1),
  })

  // Logo left-aligned
  if (logoImage) {
    const maxLogoH = bandHeight - 10
    const scale = maxLogoH / logoImage.height
    const logoW = logoImage.width * scale
    const logoH = logoImage.height * scale
    page.drawImage(logoImage, {
      x: page.getWidth() - logoW - 16, // ← 16px from the right
      y: height - bandHeight + (bandHeight - logoH) / 2,
      width: logoW,
      height: logoH,
    })
  }
}

function drawFooter(
  page: any,
  { font, ORANGE, footerLines }: { font: any; ORANGE: RGB; footerLines: string[] }
) {
  const { width } = page.getSize()
  const fontSize = 8
  let y = 20
  for (const line of footerLines) {
    const textWidth = font.widthOfTextAtSize(line, fontSize)
    page.drawText(line, {
      x: (width - textWidth) / 2,
      y,
      size: fontSize,
      font,
      color: ORANGE, // Zitko orange text
    })
    y -= 10
  }
}

async function embedImage(pdfDoc: PDFDocument, bytes: ArrayBuffer) {
  try {
    return await pdfDoc.embedPng(bytes)
  } catch {
    return await pdfDoc.embedJpg(bytes)
  }
}

async function tryGetLogoBytes(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || ''}${ZITKO_BRAND.LOGO_PATH}`
    )
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

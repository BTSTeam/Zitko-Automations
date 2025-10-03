// app/api/docx/to-html/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import sanitizeHtml from 'sanitize-html'

const MAX_BYTES = 20 * 1024 * 1024 // tune as needed

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 })
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'File too large' }, { status: 413 })
    }

    const arrayBuffer = await file.arrayBuffer()

    // ---- Mammoth image option shim (typings don't expose .images.inline())
    const mAny = mammoth as any
    const convertImage =
      mAny?.images?.inline?.() ??
      // fallback builds base64 <img> if inline() isn't available
      mAny?.images?.imgElement?.((image: any) =>
        image.read('base64').then((b64: string) => ({
          src: `data:${image.contentType};base64,${b64}`,
        }))
      )

    // DOCX -> HTML
    const { value: rawHtml } = await mammoth.convertToHtml(
      { buffer: Buffer.from(arrayBuffer) },
      convertImage ? { convertImage } : undefined
    )

    // Sanitize in Node (no JSDOM needed)
    const html = sanitizeHtml(rawHtml, {
      allowedTags: [
        'h1','h2','h3','h4','h5','h6','p','ul','ol','li','strong','em','b','i','u',
        'table','thead','tbody','tr','th','td','blockquote','hr','br','span','img'
      ],
      allowedAttributes: {
        a: ['href','title'],
        img: ['src','alt'],
        '*': ['style','colspan','rowspan']
      },
      allowedSchemes: ['http', 'https', 'data', 'mailto', 'tel']
    })

    return NextResponse.json({ ok: true, html })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}

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

    // DOCX -> HTML
    const { value: rawHtml } = await mammoth.convertToHtml(
      { buffer: Buffer.from(arrayBuffer) },
      { convertImage: mammoth.images.inline() } // inline images as base64 (optional)
    )

    // Sanitize in Node (no JSDOM needed)
    const html = sanitizeHtml(rawHtml, {
      // allow the basics used in CVs
      allowedTags: [
        'h1','h2','h3','h4','h5','h6','p','ul','ol','li','strong','em','b','i','u',
        'table','thead','tbody','tr','th','td','blockquote','hr','br','span','img'
      ],
      allowedAttributes: {
        a: ['href','title'],
        img: ['src','alt'],
        '*': ['style','colspan','rowspan']
      },
      // keep links but prevent javascript: etc.
      allowedSchemes: ['http', 'https', 'data', 'mailto', 'tel'],
      // optional: limit CSS to safe subset, or strip styles entirely by removing 'style' above
      // transformTags: { ... } // if you want to normalize headings/lists further
    })

    return NextResponse.json({ ok: true, html })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}

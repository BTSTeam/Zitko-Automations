// app/api/docx/to-html/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

// npm i mammoth
import mammoth from 'mammoth'
// npm i isomorphic-dompurify  (or use your preferred sanitizer)
import createDOMPurify from 'isomorphic-dompurify'
import { JSDOM } from 'jsdom'

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
    const { value: rawHtml } = await mammoth.convertToHtml({ buffer: Buffer.from(arrayBuffer) }, {
      convertImage: mammoth.images.inline() // optional: inline images as base64
    })

    // Sanitize (server-side)
    const window = new JSDOM('').window as any
    const DOMPurify = createDOMPurify(window)
    const html = DOMPurify.sanitize(rawHtml, {
      ALLOWED_ATTR: ['href', 'title', 'alt', 'colspan', 'rowspan', 'style'],
      ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','ul','ol','li','strong','em','b','i','u','table','thead','tbody','tr','th','td','blockquote','hr','br','span','img']
    })

    return NextResponse.json({ ok: true, html })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}

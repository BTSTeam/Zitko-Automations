// app/api/upload/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

const MAX_BYTES = 25 * 1024 * 1024 // 25MB cap; adjust if needed

function sanitizeFilename(name: string): string {
  // Keep alphanumerics, dot, dash, underscore; collapse spaces
  const cleaned = name
    .replace(/[^\w.\- ]+/g, '')        // strip weird chars
    .replace(/\s+/g, '_')              // spaces -> underscores
    .replace(/^_+|_+$/g, '')           // trim leading/trailing underscores
  return cleaned || 'upload.bin'
}

function ensurePdfExtension(name: string, mime?: string | null): string {
  // If it's clearly a PDF, make sure it ends with .pdf
  const looksPdf = !!mime?.toLowerCase().includes('pdf') || name.toLowerCase().endsWith('.pdf')
  if (!looksPdf) return name
  return name.toLowerCase().endsWith('.pdf') ? name : `${name.replace(/\.[^.]+$/, '')}.pdf`
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file found in form-data under "file"' }, { status: 400 })
    }

    // Filename precedence: explicit form field -> file.name -> fallback
    const requestedName = (form.get('filename') || (file as any).name || 'upload.bin').toString()
    let filename = sanitizeFilename(requestedName)

    const contentType = file.type || 'application/octet-stream'
    const size = typeof file.size === 'number' ? file.size : undefined

    if (size && size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: `File too large (max ${Math.floor(MAX_BYTES / (1024 * 1024))}MB).` }, { status: 413 })
    }

    // Optional: if you only ever call this for baked Sales PDFs, force .pdf extension
    // Comment this line out if you want to allow arbitrary types.
    filename = ensurePdfExtension(filename, contentType)

    // Server-side diagnostics (Vercel → Functions → Logs)
    console.log('[UPLOAD] received', { name: filename, size, type: contentType })

    // Store as PUBLIC so Vincere can retrieve via URL.
    // addRandomSuffix avoids overwriting when names repeat.
    const blob = await put(filename, file, {
      access: 'public',
      contentType,          // ensure correct MIME type on the blob
      addRandomSuffix: true // prevents accidental collisions
    })

    console.log('[UPLOAD] stored', { url: blob.url })

    return NextResponse.json({
      ok: true,
      url: blob.url,        // permanent public URL
      name: filename,
      size,
      contentType
    })
  } catch (err: any) {
    console.error('[UPLOAD] error:', err?.message || err)
    return NextResponse.json({ ok: false, error: err?.message || 'Upload failed' }, { status: 500 })
  }
}

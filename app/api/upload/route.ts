// app/api/upload/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const filename = (form.get('filename') || (file?.name ?? 'upload.bin')).toString()

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file found in form-data under "file"' }, { status: 400 })
    }

    // Server-side diagnostics (see Vercel → Functions → Logs)
    console.log('[UPLOAD] received file', {
      name: filename,
      size: file.size,
      type: file.type,
    })

    // PUBLIC so Vincere can fetch the URL
    const blob = await put(filename, file, { access: 'public' })

    console.log('[UPLOAD] blob stored', { url: blob.url })

    return NextResponse.json({ ok: true, url: blob.url, name: filename })
  } catch (err: any) {
    console.error('[UPLOAD] error:', err?.message || err)
    return NextResponse.json({ ok: false, error: err?.message || 'Upload failed' }, { status: 500 })
  }
}

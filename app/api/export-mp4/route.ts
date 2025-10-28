// app/api/export-mp4/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs' // large uploads -> not edge

type JsonBody =
  | { dataUrl: string; jobId?: string; filename?: string }
  | {}

/**
 * Accepts either:
 *  - multipart/form-data with a `file` field (Blob of the composited video), or
 *  - application/json with `dataUrl: "data:video/webm;base64,..."`.
 *
 * Uploads to Cloudinary (unsigned preset) and returns MP4 playback & download URLs.
 *
 * Required env:
 *  - CLOUDINARY_CLOUD_NAME
 *  - CLOUDINARY_UNSIGNED_PRESET
 *  - (optional) NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (if you use it elsewhere)
 */
export async function POST(req: NextRequest) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const preset = process.env.CLOUDINARY_UNSIGNED_PRESET

  if (!cloudName || !preset) {
    return NextResponse.json(
      { error: 'Missing CLOUDINARY_CLOUD_NAME or CLOUDINARY_UNSIGNED_PRESET' },
      { status: 500 }
    )
  }

  const ct = req.headers.get('content-type') || ''
  let file: File | null = null
  let jobId = 'unassigned'
  let filename = 'job-post.mp4'

  try {
    if (ct.includes('multipart/form-data')) {
      // ----- Multipart form path -----
      const form = await req.formData()
      file = form.get('file') as File | null
      jobId = (form.get('jobId') as string) || 'unassigned'
      filename = (form.get('filename') as string) || 'job-post.mp4'
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }
    } else if (ct.includes('application/json')) {
      // ----- JSON path with dataUrl -----
      const body = (await req.json().catch(() => ({}))) as JsonBody
      const dataUrl = (body as any)?.dataUrl as string | undefined
      jobId = ((body as any)?.jobId as string) || 'unassigned'
      filename = ((body as any)?.filename as string) || 'job-post.mp4'
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        return NextResponse.json(
          { error: 'Expected JSON with dataUrl: "data:video/webm;base64,...".' },
          { status: 400 }
        )
      }
      // Convert dataURL -> File
      const [meta, b64] = dataUrl.split(',')
      const mime = meta.slice(5, meta.indexOf(';')) || 'video/webm'
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      file = new File([bytes], 'composite.webm', { type: mime })
    } else {
      return NextResponse.json(
        { error: 'Unsupported content-type. Use multipart/form-data or application/json.' },
        { status: 415 }
      )
    }

    // ----- Upload to Cloudinary (unsigned) -----
    const body = new FormData()
    body.append('upload_preset', preset)
    body.append('file', file!)
    // keep your library tidy
    body.append('folder', `job-posts/${jobId}`)
    body.append('tags', `job:${jobId},type:composite`)
    // NOTE: you can optionally set eager transforms in the unsigned preset

    const uploadResp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
      method: 'POST',
      body,
    })

    if (!uploadResp.ok) {
      const detail = await uploadResp.text().catch(() => '')
      return NextResponse.json({ error: 'Cloudinary upload failed', detail }, { status: 502 })
    }

    const json = await uploadResp.json()

    // We’ll build handy MP4 URLs using on-the-fly transform `f_mp4`
    const publicId: string = json.public_id // e.g. job-posts/123/abc123
    const mp4Playback = `https://res.cloudinary.com/${cloudName}/video/upload/f_mp4/${publicId}.mp4`
    const mp4Download = `https://res.cloudinary.com/${cloudName}/video/upload/fl_attachment:${encodeURIComponent(
      filename.replace(/\.mp4$/i, '') + '.mp4'
    )}/f_mp4/${publicId}.mp4`

    return NextResponse.json({
      publicId,
      bytes: json.bytes,
      duration: json.duration,
      createdAt: json.created_at,
      // convenient links
      playbackMp4: mp4Playback,
      downloadMp4: mp4Download,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Export failed', detail: e?.message || String(e) },
      { status: 500 }
    )
  }
}

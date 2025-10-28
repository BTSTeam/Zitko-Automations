// app/api/upload-video/route.ts
import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs' // use node if proxying big files

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const jobId = (form.get('jobId') as string) || 'unassigned'
  const mime = (form.get('mime') as string) || 'video/webm'
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME
  const preset = process.env.CLOUDINARY_UNSIGNED_PRESET!
  if (!cloudName) {
    return NextResponse.json(
      { error: 'Cloudinary cloud name not set' },
      { status: 500 }
    )
  }

  const body = new FormData()
  body.append('upload_preset', preset)
  body.append('file', file)
  body.append('folder', `job-posts/${jobId}`)
  body.append('tags', `job:${jobId}`)

  const r = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    {
      method: 'POST',
      body,
    }
  )

  if (!r.ok) {
    const err = await r.text().catch(() => '')
    return NextResponse.json({ error: 'Upload failed', detail: err }, { status: 500 })
  }

  const json = await r.json()

  // ✅ Build MP4 playback & download URLs
  const base = `https://res.cloudinary.com/${cloudName}/video/upload`
  const playbackMp4 = `${base}/q_auto:good,f_mp4/${json.public_id}.mp4`
  const downloadMp4 = `${base}/fl_attachment:video.mp4,f_mp4/${json.public_id}.mp4`

  // ✅ Return all fields needed by the app
  return NextResponse.json({
    publicId: json.public_id,   
    url: json.secure_url,      
    playbackMp4,                
    downloadMp4,                
    bytes: json.bytes,
    duration: json.duration,
    createdAt: json.created_at,
    mime
  })
}

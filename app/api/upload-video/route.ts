import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs' // use node if proxying big files

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const jobId = (form.get('jobId') as string) || 'unassigned'
  const mime = (form.get('mime') as string) || 'video/webm'
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!
  const preset = process.env.CLOUDINARY_UNSIGNED_PRESET!

  const body = new FormData()
  body.append('upload_preset', preset)
  body.append('file', file)

  // keep your library tidy
  body.append('folder', `job-posts/${jobId}`)
  body.append('tags', `job:${jobId}`)

  // If you set an eager transform in the preset, you don't need to add it here.
  // Otherwise you can request on-the-fly mp4 at delivery time.

  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
    method: 'POST',
    body
  })
  if (!r.ok) {
    const err = await r.text().catch(() => '')
    return NextResponse.json({ error: 'Upload failed', detail: err }, { status: 500 })
  }
  const json = await r.json()

  // Return the fields you’ll want to persist on the Job Post
  return NextResponse.json({
    publicId: json.public_id,   // e.g. job-posts/123/ab12cd
    url: json.secure_url,       // original format url
    bytes: json.bytes,
    duration: json.duration,
    createdAt: json.created_at,
    mime
  })
}

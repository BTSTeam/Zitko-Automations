import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge' // or 'nodejs' if you prefer

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const mime = form.get('mime') as string | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!
  const preset = process.env.CLOUDINARY_UNSIGNED_PRESET! // create this in Cloudinary

  const body = new FormData()
  body.append('upload_preset', preset)
  body.append('file', file)

  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, { method: 'POST', body })
  if (!r.ok) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  const json = await r.json()
  return NextResponse.json({ url: json.secure_url, publicId: json.public_id, mime })
}

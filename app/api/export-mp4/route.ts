// app/api/export-mp4/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import type { UploadApiResponse } from 'cloudinary'

export const runtime = 'nodejs'

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
})

export async function GET(req: NextRequest) {
  const publicId = req.nextUrl.searchParams.get('publicId')
  const asDownload = req.nextUrl.searchParams.get('download') === '1'
  if (!publicId) {
    return NextResponse.json({ error: 'Missing publicId' }, { status: 400 })
  }

  // short-lived signed MP4 (private asset)
  const signedMp4 = cloudinary.url(publicId, {
    resource_type: 'video',
    type: 'private',
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1h
    transformation: [{ quality: 'auto:good' }, { fetch_format: 'mp4' }],
    secure: true,
    format: 'mp4',
  })

  if (!asDownload) return NextResponse.redirect(signedMp4, 302)

  const r = await fetch(signedMp4)
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    return NextResponse.json({ error: 'Transcode/download failed', detail }, { status: 502 })
  }
  const blob = await r.blob()
  const filename = `${publicId.split('/').pop() || 'video'}.mp4`

  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(blob.size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

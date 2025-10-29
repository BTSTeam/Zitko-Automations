// app/api/upload-video/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import type { UploadApiResponse } from 'cloudinary'

export const runtime = 'nodejs'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME
  || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
})

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const jobId = (form.get('jobId') as string) || 'unassigned'
    const mime = (form.get('mime') as string) || 'video/webm'
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const ab = await file.arrayBuffer()
    const buffer = Buffer.from(ab)

    // Use the type from the root 'cloudinary' module
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: `job-posts/${jobId}`,
          type: 'authenticated',
          overwrite: true,
          tags: [`job:${jobId}`],
        },
        (err, res) => (err || !res ? reject(err || new Error('Upload failed')) : resolve(res))
      )
      upload.end(buffer)
    })

    // short-lived signed MP4 URLs (1 hour)
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60
    const commonOpts = {
      resource_type: 'video' as const,
      type: 'authenticated' as const,
      sign_url: true,
      expires_at: expiresAt,
      transformation: [{ quality: 'auto:good' }, { fetch_format: 'mp4' }],
      secure: true,
      format: 'mp4',
    }

    const playbackMp4 = cloudinary.url(result.public_id, commonOpts)
    const downloadMp4 = cloudinary.url(result.public_id, {
      ...commonOpts,
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'mp4' },
        { flags: 'attachment:video.mp4' },
      ],
    })

    return NextResponse.json({
      publicId: result.public_id,
      url: result.secure_url,
      playbackMp4,
      downloadMp4,
      bytes: result.bytes,
      duration: (result as any).duration,
      createdAt: result.created_at,
      mime,
    })
  } catch (e: any) {
    const msg = e?.message || 'Upload failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

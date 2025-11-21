import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

export const runtime = 'nodejs'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
})

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const uploaded = await cloudinary.uploader.upload_stream(
    {
      folder: 'job-posters',
      resource_type: 'image',
      format: 'png',
    },
    (error, result) => { /* handled via Promise wrapper */ }
  )
  // (wrap upload_stream in a Promise and resolve with result)

  return NextResponse.json({
    posterPublicId: uploaded.public_id,
  })
}

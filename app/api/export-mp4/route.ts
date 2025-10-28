// app/api/export-mp4/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

export const runtime = 'nodejs';

// Configure Cloudinary – use server-side vars, fall back to public if defined
cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

export async function GET(req: NextRequest) {
  const publicId = req.nextUrl.searchParams.get('publicId');
  const asDownload = req.nextUrl.searchParams.get('download') === '1';

  if (!publicId) {
    return NextResponse.json({ error: 'Missing publicId' }, { status: 400 });
  }

  // filename used only when forcing download
  const filename = `${publicId.split('/').pop() || 'video'}.mp4`;

  // Common options for signed URL generation
  const commonOpts = {
    resource_type: 'video' as const,
    type: 'authenticated' as const, // allows signed delivery
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    transformation: [
      { quality: 'auto:good' },
      { fetch_format: 'mp4' },
    ],
    secure: true,
    format: 'mp4',
  };

  // Add attachment flag if a file download is requested
  const opts = asDownload
    ? {
        ...commonOpts,
        flags: `attachment:${filename}`,
      }
    : commonOpts;

  // Create the signed URL and redirect the client there
  const signedMp4 = cloudinary.url(publicId, opts);
  return NextResponse.redirect(signedMp4, 302);
}

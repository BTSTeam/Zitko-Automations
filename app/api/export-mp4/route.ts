// app/api/export-mp4/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

export const runtime = 'nodejs';

// Configure Cloudinary – prefer server env vars, fall back to public if needed
cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

export async function GET(req: NextRequest) {
  try {
    const publicId = req.nextUrl.searchParams.get('publicId');
    const asDownload = req.nextUrl.searchParams.get('download') === '1';

    if (!publicId) {
      return NextResponse.json({ error: 'Missing publicId' }, { status: 400 });
    }

    // Clean up potential slashes/spaces for a safe filename
    const safeName =
      publicId.split('/').pop()?.replace(/[^\w.-]/g, '_') || 'video';
    const filename = `${safeName}.mp4`;

    // Shared options for generating signed MP4 URL
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
    const commonOpts = {
      resource_type: 'video' as const,
      type: 'authenticated' as const, // signed delivery for private videos
      sign_url: true,
      expires_at: expiresAt,
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'mp4' },
      ],
      secure: true,
      format: 'mp4',
    };

    // Add attachment flag if download=1
    const opts = asDownload
      ? {
          ...commonOpts,
          flags: `attachment:${filename}`,
        }
      : commonOpts;

    // Generate a short-lived signed URL
    const signedMp4 = cloudinary.url(publicId, opts);

    // Redirect the browser directly to Cloudinary
    return NextResponse.redirect(signedMp4, 302);
  } catch (err: any) {
    console.error('Error generating MP4 export URL:', err);
    return NextResponse.json(
      { error: 'Failed to generate signed video URL', detail: err?.message },
      { status: 500 }
    );
  }
}

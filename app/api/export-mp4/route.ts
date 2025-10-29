// app/api/export-mp4/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

export const runtime = 'nodejs';

// Cloudinary config (prefer server var, fallback to public if needed)
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

    // Safe filename for attachment
    const safeName =
      publicId.split('/').pop()?.replace(/[^\w.-]/g, '_') || 'video';
    const filename = `${safeName}.mp4`;

    // Signed URL expiry (1 hour)
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;

    // app/api/export-mp4/route.ts
    const transformation = asDownload
      ? [{ quality: 'auto:good' }, { fetch_format: 'mp4' }, { flags: 'attachment' }]
      : [{ quality: 'auto:good' }, { fetch_format: 'mp4' }];
    
    const opts = {
      resource_type: 'video' as const,
      type: 'authenticated' as const,
      sign_url: true,
      expires_at: expiresAt,
      secure: true,
      format: 'mp4',
      transformation,
    };
    
    // Add download name separately, after URL generation
    let signedMp4 = cloudinary.url(publicId, opts);
if (asDownload) signedMp4 += `&download=${encodeURIComponent(filename)}`;

// Add download name separately, after URL generation
let signedMp4 = cloudinary.url(publicId, opts);
if (asDownload) signedMp4 += `&download=${encodeURIComponent(filename)}`;

    // Generate the short-lived signed URL and redirect
    const signedMp4 = cloudinary.url(publicId, opts);
    return NextResponse.redirect(signedMp4, 302);
  } catch (err: any) {
    console.error('Error generating MP4 export URL:', err);
    return NextResponse.json(
      { error: 'Failed to generate signed video URL', detail: err?.message },
      { status: 500 }
    );
  }
}

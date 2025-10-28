// app/api/export-mp4/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const publicId = req.nextUrl.searchParams.get('publicId');
  const asDownload = req.nextUrl.searchParams.get('download') === '1';

  if (!publicId) {
    return NextResponse.json({ error: 'Missing publicId' }, { status: 400 });
  }

  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (!cloudName) {
    return NextResponse.json({ error: 'Cloudinary cloud name not set' }, { status: 500 });
  }

  // Force H.264/AAC MP4 (cached by Cloudinary once rendered)
  const mp4Url = `https://res.cloudinary.com/${cloudName}/video/upload/q_auto:good,f_mp4/${publicId}.mp4`;

  // If not downloading, just redirect to let the browser stream/play it
  if (!asDownload) {
    return NextResponse.redirect(mp4Url, 302);
  }

  // Otherwise proxy the file with a Content-Disposition: attachment
  const r = await fetch(mp4Url);
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    return NextResponse.json({ error: 'Transcode/download failed', detail }, { status: 502 });
  }

  const blob = await r.blob();
  const filename = `${publicId.split('/').pop() || 'video'}.mp4`;

  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(blob.size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

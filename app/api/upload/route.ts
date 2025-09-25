export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

// POST /api/upload  (multipart/form-data)
// form fields:
//   - file: File (required)
//   - filename: string (optional, suggested name)
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const filename = (form.get('filename') as string | null)?.trim() || undefined;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'file is required' }, { status: 400 });
    }

    // Upload to Vercel Blob as a *public* file
    const blob = await put(filename || file.name || 'upload.pdf', file, {
      access: 'public', // gives a public URL
      addRandomSuffix: true,
      contentType: file.type || 'application/octet-stream',
      token: process.env.BLOB_READ_WRITE_TOKEN, // 👈 required!
    });

    return NextResponse.json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

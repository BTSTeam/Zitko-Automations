import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";

export const runtime = "nodejs";

// ------------- Cloudinary config -------------

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

// Helper: upload a Buffer via Cloudinary's upload_stream
function uploadFromBuffer(buffer: Buffer): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "job-posters", // change folder if you want
        resource_type: "image",
        format: "png",
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Cloudinary upload returned no result"));
        }
        resolve(result);
      },
    );

    stream.end(buffer);
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let bufferLength = 0;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file field provided" },
        { status: 400 },
      );
    }

    // Read file into a Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    bufferLength = buffer.length;

    if (!bufferLength) {
      return NextResponse.json(
        { error: "Uploaded file buffer is empty" },
        { status: 400 },
      );
    }

    // Upload buffer directly via upload_stream
    const uploaded = await uploadFromBuffer(buffer);

    return NextResponse.json({
      posterPublicId: uploaded.public_id,
      bytes: uploaded.bytes,
      format: uploaded.format,
      secure_url: uploaded.secure_url,
    });
  } catch (err: any) {
    let rawError: any = null;
    try {
      rawError = JSON.parse(JSON.stringify(err));
    } catch {
      rawError = String(err);
    }

    const message =
      err?.message ||
      err?.error?.message ||
      "Failed to upload poster to Cloudinary";

    console.error("upload-poster error:", err);

    return NextResponse.json(
      {
        error: message,
        cloudinaryError: err?.error || null,
        bufferLength,
        rawError,
      },
      { status: 500 },
    );
  }
}

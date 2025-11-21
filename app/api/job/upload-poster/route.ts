import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

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

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    // Convert to base64 data URI for Cloudinary
    const mimeType = file.type || "image/png";
    const base64 = buffer.toString("base64");
    const dataUri = `data:${mimeType};base64,${base64}`;

    // Upload to Cloudinary as an image
    const uploaded = await cloudinary.uploader.upload(dataUri, {
      folder: "job-posters", // change folder if you want
      resource_type: "image",
      // let Cloudinary decide final format or force png; both okay
      format: "png",
    });

    return NextResponse.json({
      posterPublicId: uploaded.public_id,
    });
  } catch (err: any) {
    // Cloudinary errors often have nested info on err.error
    const message =
      err?.message ||
      err?.error?.message ||
      "Failed to upload poster to Cloudinary";

    console.error("upload-poster error:", err);

    return NextResponse.json(
      {
        error: message,
        // helpful extra details if you inspect Network tab
        cloudinaryError: err?.error || null,
      },
      { status: 500 },
    );
  }
}

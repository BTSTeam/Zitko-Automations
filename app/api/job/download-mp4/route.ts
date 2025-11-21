import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary MP4 composer for social media job posts.
 * NEW VERSION:
 * - Takes a recorded video (videoPublicId)
 * - Takes a finished poster uploaded to Cloudinary (posterPublicId)
 * - Uses the poster as the full background (already includes text + icon)
 * - Overlays the circular video on top at the correct position
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // ensure dynamic route

// ---------------- Cloudinary config ----------------

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, // fallback if typo
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

// ---------------- Types ----------------

type TemplateId = "zitko-1" | "zitko-2";

interface Body {
  videoPublicId: string;
  posterPublicId: string;
  templateId?: TemplateId;
  videoPos?: { x: number; y: number };

  // legacy fields still accepted but ignored:
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  benefits?: string;
  email?: string;
  phone?: string;
  positions?: any;
  fontSizes?: any;
  templateUrl?: string;
}

// Video box (where the circular video sits)
type VideoBox = { x: number; y: number; w: number; h: number };

// Only need the video layout per template now
const VIDEO_LAYOUTS: Record<TemplateId, VideoBox> = {
  "zitko-1": { x: 80, y: 400, w: 300, h: 300 },
  "zitko-2": { x: 705, y: 540, w: 300, h: 300 },
};

// ---------------- Helpers ----------------

function stripExt(id: string): string {
  return id.replace(/\.(mp4|mov|m4v|webm)$/i, "");
}

// ---------------- Handler ----------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const {
      videoPublicId,
      posterPublicId,
      templateId = "zitko-1",
      videoPos,
    } = (await req.json()) as Body;

    if (!videoPublicId) {
      return NextResponse.json(
        { error: "Missing videoPublicId" },
        { status: 400 }
      );
    }

    if (!posterPublicId) {
      return NextResponse.json(
        { error: "Missing posterPublicId" },
        { status: 400 }
      );
    }

    const cleanVideoId = stripExt(videoPublicId);

    // ----- Check video exists in Cloudinary -----
    try {
      // @ts-ignore Cloudinary admin API
      const info = await cloudinary.api.resource(cleanVideoId, {
        resource_type: "video",
        type: "authenticated",
      });
      if (!info || info.type !== "authenticated") {
        return NextResponse.json(
          {
            error: "Cloudinary video found but not 'authenticated' type",
            foundType: info?.type,
            publicId: cleanVideoId,
          },
          { status: 404 }
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Cloudinary video not found",
          publicId: cleanVideoId,
          details: e?.message,
        },
        { status: 404 }
      );
    }

    // (Optional) sanity check poster exists as image
    try {
      // @ts-ignore Cloudinary admin API
      await cloudinary.api.resource(posterPublicId, {
        resource_type: "image",
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Cloudinary poster image not found",
          posterPublicId,
          details: e?.message,
        },
        { status: 404 }
      );
    }

    // ----- Compute video placement -----
    const CANVAS = 1080; // both templates are 1080x1080
    const baseVideoLayout =
      VIDEO_LAYOUTS[templateId] || VIDEO_LAYOUTS["zitko-1"];

    const videoX = videoPos?.x ?? baseVideoLayout.x;
    const videoY = videoPos?.y ?? baseVideoLayout.y;
    const videoSize = Math.min(baseVideoLayout.w, baseVideoLayout.h);

    // For overlaying the same video as a circular layer
    const overlayIdForLayer = cleanVideoId.replace(/\//g, ":");

    // ----- Build Cloudinary transformation -----
    const transformations: any[] = [];

    // 1) Base canvas
    transformations.push({
      width: CANVAS,
      height: CANVAS,
      crop: "fill",
    });

    // 2) Poster image as full background
    // posterPublicId is an IMAGE stored in your Cloudinary account
    transformations.push({
      overlay: `image:${posterPublicId}`,
      width: CANVAS,
      height: CANVAS,
      crop: "fill",
    });
    transformations.push({
      gravity: "north_west",
      x: 0,
      y: 0,
      flags: "layer_apply",
    });

    // 3) Circular video overlay on top of the poster
    transformations.push({
      overlay: `video:authenticated:${overlayIdForLayer}`,
      width: videoSize,
      height: videoSize,
      crop: "fill",
      radius: "max", // circular mask
    });
    transformations.push({
      gravity: "north_west",
      x: videoX,
      y: videoY,
      flags: "layer_apply",
    });

    // 4) Export as MP4
    transformations.push({ fetch_format: "mp4", quality: "auto" });

    const composedUrl = cloudinary.url(cleanVideoId, {
      resource_type: "video",
      type: "authenticated",
      sign_url: true,
      transformation: transformations,
    });

    const debug = req.nextUrl.searchParams.get("debug") === "1";
    if (debug) {
      return NextResponse.json(
        {
          composedUrl,
          posterPublicId,
          templateId,
          videoX,
          videoY,
          videoSize,
          hint: "Open composedUrl in a new tab if you need to inspect Cloudinary output directly.",
        },
        { status: 200 }
      );
    }

    // ----- Fetch generated MP4 from Cloudinary -----
    const videoRes = await fetch(composedUrl);
    if (!videoRes.ok) {
      const errText = await videoRes.text().catch(() => "");
      const cldError = videoRes.headers.get("x-cld-error") || undefined;
      return NextResponse.json(
        {
          error: "Failed to compose video",
          status: videoRes.status,
          cloudinaryError: cldError,
          details: errText.slice(0, 2000),
          composedUrl,
          posterPublicId,
        },
        { status: 500 }
      );
    }

    const bodyBuf = Buffer.from(await videoRes.arrayBuffer());
    return new NextResponse(bodyBuf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bodyBuf.length),
        "Content-Disposition": 'attachment; filename="job-post.mp4"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

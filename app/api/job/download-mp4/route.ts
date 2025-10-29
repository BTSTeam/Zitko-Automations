import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

type Body = {
  videoPublicId: string;          // e.g. "job-posts/unassigned/abc123"
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  templateId?: string;            // e.g. "zitko-1" (maps to /public/templates/zitko-dark-arc.png)
  templateUrl?: string;           // optional: pass a full URL directly instead of templateId
};

// Map your UI template IDs -> png filenames under /public/templates
const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
};

function encodeText(t?: string) {
  if (!t) return "";
  // Cloudinary text overlay needs commas double-encoded
  return encodeURIComponent(t).replace(/%2C/g, "%252C");
}

export async function POST(req: NextRequest) {
  try {
    const {
      videoPublicId,
      title = "JOB TITLE",
      location = "LOCATION",
      salary = "SALARY",
      description = "SHORT DESCRIPTION",
      templateId = "zitko-1",
      templateUrl, // if provided, overrides templateId mapping
    } = (await req.json()) as Body;

    if (!videoPublicId) {
      return NextResponse.json({ error: "Missing videoPublicId" }, { status: 400 });
    }

    // Build absolute URL to the PNG in /public/templates
    const origin = req.nextUrl.origin; // e.g. https://yourdomain.com
    const filename = TEMPLATE_FILES[templateId] || TEMPLATE_FILES["zitko-1"];
    const localTemplateUrl = `${origin}/templates/${filename}`;
    const effectiveTemplateUrl = templateUrl || localTemplateUrl;

    const CANVAS = 1080;

    const composedUrl = cloudinary.url(videoPublicId, {
      resource_type: "video",
      type: "authenticated", // your video is served from /video/authenticated/...
      sign_url: true,
      transformation: [
        // Base canvas
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // UNDERLAY from your Next.js public asset using "fetch:"
        // IMPORTANT: the URL must be URL-encoded after "fetch:"
        {
          underlay: `fetch:${encodeURIComponent(effectiveTemplateUrl)}`,
          width: CANVAS,
          height: CANVAS,
          crop: "fill",
        },

        // Circular video overlay (also authenticated)
        {
          overlay: {
            resource_type: "video",
            type: "authenticated",
            public_id: videoPublicId,
            transformation: [{ width: 360, height: 360, crop: "fill", radius: "max" }],
          },
        },
        { gravity: "north_west", x: 60, y: 430, flags: "layer_apply" },

        // TITLE
        {
          overlay: {
            font_family: "Arial",
            font_size: 56,
            font_weight: "bold",
            text: encodeText(title),
          },
          color: "#ffffff",
        },
        { gravity: "north_west", x: 160, y: 160, flags: "layer_apply" },

        // LOCATION
        {
          overlay: {
            font_family: "Arial",
            font_size: 36,
            font_weight: "bold",
            text: encodeText(location),
          },
          color: "#cfd3d7",
        },
        { gravity: "north_west", x: 480, y: 250, flags: "layer_apply" },

        // SALARY
        {
          overlay: {
            font_family: "Arial",
            font_size: 32,
            font_weight: "bold",
            text: encodeText(salary),
          },
          color: "#cfd3d7",
        },
        { gravity: "north_west", x: 480, y: 310, flags: "layer_apply" },

        // DESCRIPTION (wrapped)
        {
          overlay: {
            font_family: "Arial",
            font_size: 28,
            text: encodeText(description),
          },
          color: "#ffffff",
          width: 520,
          crop: "fit",
        },
        { gravity: "north_west", x: 480, y: 380, flags: "layer_apply" },

        { fetch_format: "mp4", quality: "auto" },
      ],
    });

    const videoRes = await fetch(composedUrl);
    if (!videoRes.ok) {
      const errText = await videoRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Failed to compose video",
          details: errText.slice(0, 2000),
          // helpful for debugging:
          composedUrl,
          templateUsed: effectiveTemplateUrl,
        },
        { status: 500 }
      );
    }

    const body = Buffer.from(await videoRes.arrayBuffer());
    return new NextResponse(body, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(body.length),
        "Content-Disposition": 'attachment; filename="job-post.mp4"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}

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
  videoPublicId: string;   // e.g. "job-posts/unassigned/abc123"
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  templateId?: string;     // "zitko-1" | "zitko-2"
  templateUrl?: string;    // optional absolute HTTPS URL; overrides templateId
};

// Map your UI template IDs -> PNG filenames under /public/templates
const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
};

function encodeText(t?: string) {
  if (!t) return "";
  // Cloudinary text overlay needs commas double-encoded; encodeURIComponent handles newlines (%0A)
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
      templateUrl,
    } = (await req.json()) as Body;

    if (!videoPublicId) {
      return NextResponse.json({ error: "Missing videoPublicId" }, { status: 400 });
    }

    // ----- Build a PUBLIC, ABSOLUTE URL for the template PNG -----
    const originFromReq = req.nextUrl.origin; // may be http://localhost:3000 in dev
    const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const isLocal = /^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(originFromReq);

    // If running locally and no public base was provided, fail early with a helpful message.
    if (isLocal && !templateUrl && !envBase) {
      return NextResponse.json(
        {
          error:
            "Template URL not publicly reachable. Set NEXT_PUBLIC_BASE_URL to your public site (e.g. https://yourapp.vercel.app) or pass a full templateUrl.",
          hint: "Cloudinary cannot fetch localhost URLs. Use a deployed URL or a tunnel (ngrok/cloudflared).",
        },
        { status: 500 }
      );
    }

    // Prefer explicit templateUrl if provided (must be absolute https)
    let effectiveTemplateUrl = templateUrl?.trim();
    if (!effectiveTemplateUrl) {
      const filename = TEMPLATE_FILES[templateId] || TEMPLATE_FILES["zitko-1"];
      const baseForCloudinary = isLocal ? envBase! : originFromReq; // on prod, origin is already public
      effectiveTemplateUrl = `${baseForCloudinary.replace(/\/$/, "")}/templates/${filename}`;
    }

    if (!/^https?:\/\//i.test(effectiveTemplateUrl)) {
      return NextResponse.json(
        { error: "templateUrl must be an absolute http(s) URL", templateUrl: effectiveTemplateUrl },
        { status: 400 }
      );
    }

    const CANVAS = 1080;

    const composedUrl = cloudinary.url(videoPublicId, {
      resource_type: "video",
      type: "authenticated", // your upload delivery type
      sign_url: true,
      transformation: [
        // 1) Base canvas
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // 2) Underlay = your PNG served by Next.js public/ via a PUBLIC URL
        {
          underlay: `fetch:${encodeURIComponent(effectiveTemplateUrl)}`,
          width: CANVAS,
          height: CANVAS,
          crop: "fill",
        },

        // 3) Video overlay (small circular window on top)
        {
          overlay: {
            resource_type: "video",
            type: "authenticated",
            public_id: videoPublicId,
            transformation: [{ width: 360, height: 360, crop: "fill", radius: "max" }],
          },
        },
        { gravity: "north_west", x: 60, y: 430, flags: "layer_apply" },

        // 4) Text overlays
        {
          overlay: { font_family: "Arial", font_size: 56, font_weight: "bold", text: encodeText(title) },
          color: "#ffffff",
        },
        { gravity: "north_west", x: 160, y: 160, flags: "layer_apply" },

        {
          overlay: { font_family: "Arial", font_size: 36, font_weight: "bold", text: encodeText(location) },
          color: "#cfd3d7",
        },
        { gravity: "north_west", x: 480, y: 250, flags: "layer_apply" },

        {
          overlay: { font_family: "Arial", font_size: 32, font_weight: "bold", text: encodeText(salary) },
          color: "#cfd3d7",
        },
        { gravity: "north_west", x: 480, y: 310, flags: "layer_apply" },

        {
          overlay: { font_family: "Arial", font_size: 28, text: encodeText(description) },
          color: "#ffffff",
          width: 520,
          crop: "fit",
        },
        { gravity: "north_west", x: 480, y: 380, flags: "layer_apply" },

        // 5) Output format
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
          composedUrl,
          templateUsed: effectiveTemplateUrl,
          baseDetected: isLocal ? envBase : originFromReq,
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

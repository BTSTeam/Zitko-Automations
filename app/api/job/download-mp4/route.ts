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
  videoPublicId: string;   // NO extension, e.g. "job-posts/unassigned/abc123"
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  templateId?: "zitko-1" | "zitko-2";
  templateUrl?: string;    // optional absolute https URL (overrides templateId)
};

const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
};

function encodeText(t?: string) {
  if (!t) return "";
  // encodeURIComponent handles newlines; Cloudinary also needs commas double-encoded
  return encodeURIComponent(t).replace(/%2C/g, "%252C");
}

function stripExt(id: string) {
  return id.replace(/\.(mp4|mov|m4v|webm)$/i, "");
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

    // Enforce public_id has NO extension (common source of 404s)
    const cleanVideoId = stripExt(videoPublicId);

    // ----- Build a PUBLIC, ABSOLUTE URL for the template PNG -----
    const originFromReq = req.nextUrl.origin; // may be http://localhost:3000
    const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const isLocal = /^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(originFromReq);

    // Prefer explicit templateUrl if provided
    let effectiveTemplateUrl = templateUrl?.trim();
    if (!effectiveTemplateUrl) {
      const filename = TEMPLATE_FILES[templateId] || TEMPLATE_FILES["zitko-1"];
      const baseForCloudinary = isLocal ? envBase : originFromReq;
      if (!baseForCloudinary) {
        return NextResponse.json(
          {
            error:
              "No public base URL available. Set NEXT_PUBLIC_BASE_URL to your deployed domain or pass a full templateUrl.",
          },
          { status: 500 }
        );
      }
      effectiveTemplateUrl = `${baseForCloudinary.replace(/\/$/, "")}/templates/${filename}`;
    }

    if (!/^https?:\/\//i.test(effectiveTemplateUrl)) {
      return NextResponse.json(
        { error: "templateUrl must be an absolute http(s) URL", templateUrl: effectiveTemplateUrl },
        { status: 400 }
      );
    }

    // Quick sanity check: can *your server* fetch the PNG?
    // (If this fails, Cloudinary definitely can't fetch it either.)
    try {
      const head = await fetch(effectiveTemplateUrl, { method: "HEAD", cache: "no-store" });
      if (!head.ok) {
        return NextResponse.json(
          {
            error: "Template PNG not reachable (HEAD failed)",
            status: head.status,
            templateUrl: effectiveTemplateUrl,
          },
          { status: 502 }
        );
      }
      const ct = head.headers.get("content-type") || "";
      if (!ct.includes("image")) {
        return NextResponse.json(
          {
            error: "Template URL did not return an image content-type",
            contentType: ct,
            templateUrl: effectiveTemplateUrl,
          },
          { status: 502 }
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: "Failed to reach template URL", templateUrl: effectiveTemplateUrl, details: e?.message },
        { status: 502 }
      );
    }

    const CANVAS = 1080;

    // --- DEBUG: return composed URL instead of streaming the video ---
    const debug = req.nextUrl.searchParams.get('debug') === '1';
    if (debug) {
      return NextResponse.json(
        {
          composedUrl,
          templateUsed: effectiveTemplateUrl,
          hint:
            "Open composedUrl in a new browser tab. Cloudinary will show the exact error " +
            "(e.g. 404 public_id, fetch blocked, invalid font, auth mismatch).",
        },
        { status: 200 }
      );
    }

    const composedUrl = cloudinary.url(cleanVideoId, {
      resource_type: "video",
      type: "authenticated", // your uploads are delivered as /video/authenticated/...
      sign_url: true,
      transformation: [
        // 1) Base canvas
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // 2) Underlay = your PNG via public HTTPS
        {
          underlay: `fetch:${encodeURIComponent(effectiveTemplateUrl)}`,
          width: CANVAS,
          height: CANVAS,
          crop: "fill",
        },

        // 3) Video overlay (small circular)
        {
          overlay: {
            resource_type: "video",
            type: "authenticated",
            public_id: cleanVideoId,
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

        // 5) Output
        { fetch_format: "mp4", quality: "auto" },
      ],
    });

    // Ask Cloudinary to render it; if they error, we bubble up the reason
    const videoRes = await fetch(composedUrl);
    if (!videoRes.ok) {
      const errText = await videoRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Failed to compose video",
          details: errText.slice(0, 4000),
          composedUrl,
          templateUsed: effectiveTemplateUrl,
          note:
            "Open composedUrl in a browser to see Cloudinary's exact error. " +
            "Common causes: wrong public_id (must be without .mp4), video not authenticated, " +
            "template URL not reachable, or invalid font name.",
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

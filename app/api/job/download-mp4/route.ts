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
  templateUrl?: string;    // absolute URL overrides templateId
};

const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
};

function encodeText(t?: string) {
  if (!t) return "";
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

    const cleanVideoId = stripExt(videoPublicId);

    // ----- Build PUBLIC template URL -----
    const originFromReq = req.nextUrl.origin;
    const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const isLocal = /^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(originFromReq);

    let effectiveTemplateUrl = templateUrl?.trim();
    if (!effectiveTemplateUrl) {
      const filename = TEMPLATE_FILES[templateId] || TEMPLATE_FILES["zitko-1"];
      const baseForCloudinary = isLocal ? envBase : originFromReq;
      if (!baseForCloudinary) {
        return NextResponse.json(
          { error: "No public base URL. Set NEXT_PUBLIC_BASE_URL or pass templateUrl." },
          { status: 500 }
        );
      }
      effectiveTemplateUrl = `${baseForCloudinary.replace(/\/$/, "")}/templates/${filename}`;
    }

    // quick reachability check
    try {
      const head = await fetch(effectiveTemplateUrl, { method: "HEAD", cache: "no-store" });
      if (!head.ok) {
        return NextResponse.json(
          { error: "Template PNG not reachable (HEAD failed)", status: head.status, templateUrl: effectiveTemplateUrl },
          { status: 502 }
        );
      }
      const ct = head.headers.get("content-type") || "";
      if (!ct.includes("image")) {
        return NextResponse.json(
          { error: "Template URL did not return an image content-type", contentType: ct, templateUrl: effectiveTemplateUrl },
          { status: 502 }
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: "Failed to reach template URL", templateUrl: effectiveTemplateUrl, details: e?.message },
        { status: 502 }
      );
    }

    // verify video exists & is authenticated
    try {
      // @ts-ignore
      const info = await cloudinary.api.resource(cleanVideoId, {
        resource_type: "video",
        type: "authenticated",
      });
      if (!info || info.type !== "authenticated") {
        return NextResponse.json(
          { error: "Cloudinary video found but not 'authenticated' type", foundType: info?.type, publicId: cleanVideoId },
          { status: 404 }
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: "Cloudinary video not found", publicId: cleanVideoId, details: e?.message },
        { status: 404 }
      );
    }

    const CANVAS = 1080;

    // 🔧 Build a *manual* overlay layer with correct colon-separated public_id and size/radius
    const overlayIdForLayer = cleanVideoId.replace(/\//g, ":"); // e.g. job-posts:unassigned:abc123
    const videoSize = 360;
    const videoX = 60;
    const videoY = 430;

    // Build composed URL
    const composedUrl = cloudinary.url(cleanVideoId, {
      resource_type: "video",
      type: "authenticated",
      sign_url: true,
      transformation: [
        // 1) Base canvas
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // 2) Underlay from your public PNG
        {
          underlay: `fetch:${encodeURIComponent(effectiveTemplateUrl)}`,
          width: CANVAS,
          height: CANVAS,
          crop: "fill",
        },

        // 3) Video overlay (manual layer so size & radius are respected AND folder colons are correct)
        { raw_transformation: `w_${videoSize},h_${videoSize},c_fill,r_max,l_video:authenticated:${overlayIdForLayer}` },
        { raw_transformation: `fl_layer_apply,g_north_west,x_${videoX},y_${videoY}` },

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

    // Debug short-circuit remains
    const debug = req.nextUrl.searchParams.get("debug") === "1";
    if (debug) {
      return NextResponse.json(
        {
          composedUrl,
          templateUsed: effectiveTemplateUrl,
          hint:
            "Open composedUrl in a new tab. This version forces correct l_video layer (colons) and overlay sizing/radius.",
        },
        { status: 200 }
      );
    }

    // Render / stream
    const videoRes = await fetch(composedUrl);
    if (!videoRes.ok) {
      const errText = await videoRes.text().catch(() => "");
      return NextResponse.json(
        { error: "Failed to compose video", details: errText.slice(0, 4000), composedUrl, templateUsed: effectiveTemplateUrl },
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

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

    // ---------- Build PUBLIC template URL ----------
    const originFromReq = req.nextUrl.origin; // can be localhost in dev
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
    if (!/^https?:\/\//i.test(effectiveTemplateUrl)) {
      return NextResponse.json({ error: "templateUrl must be absolute http(s) URL", templateUrl: effectiveTemplateUrl }, { status: 400 });
    }

    // ---------- Pre-flight: check template is reachable ----------
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

    // ---------- Pre-flight: verify video exists (Admin API) ----------
    try {
      // IMPORTANT: type: 'authenticated' and resource_type: 'video'
      // @ts-ignore (types for admin calls may require import('cloudinary').v2.api)
      const info = await cloudinary.api.resource(cleanVideoId, {
        resource_type: "video",
        type: "authenticated",
      });
      if (!info || info.type !== "authenticated") {
        return NextResponse.json(
          {
            error: "Cloudinary video found but not 'authenticated' type",
            foundType: info?.type,
            hint: "Ensure the uploaded video delivery type is authenticated and use the bare public_id (no .mp4).",
            publicId: cleanVideoId,
          },
          { status: 404 }
        );
      }
    } catch (e: any) {
      // Admin API throws if not found
      return NextResponse.json(
        {
          error: "Cloudinary video not found",
          publicId: cleanVideoId,
          details: e?.message,
          hint: "Make sure you pass the exact public_id returned by your Recorder onUploaded (no file extension).",
        },
        { status: 404 }
      );
    }

    const CANVAS = 1080;

    // ---------- Build composed URL ----------
    const composedUrl = cloudinary.url(cleanVideoId, {
      resource_type: "video",
      type: "authenticated",
      sign_url: true,
      transformation: [
        { width: CANVAS, height: CANVAS, crop: "fill" },
        {
          underlay: `fetch:${encodeURIComponent(effectiveTemplateUrl)}`,
          width: CANVAS,
          height: CANVAS,
          crop: "fill",
        },
        {
          overlay: {
            resource_type: "video",
            type: "authenticated",
            public_id: cleanVideoId,
            transformation: [{ width: 360, height: 360, crop: "fill", radius: "max" }],
          },
        },
        { gravity: "north_west", x: 60, y: 430, flags: "layer_apply" },
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
        { fetch_format: "mp4", quality: "auto" },
      ],
    });

    // ---------- Debug short-circuit ----------
    const debug = req.nextUrl.searchParams.get("debug") === "1";
    if (debug) {
      return NextResponse.json(
        {
          composedUrl,
          templateUsed: effectiveTemplateUrl,
          hint:
            "Open composedUrl in a new tab to see Cloudinary's exact message (if any). " +
            "Video existence and template reachability have already passed.",
        },
        { status: 200 }
      );
    }

    // ---------- Render / stream ----------
    const videoRes = await fetch(composedUrl);
    if (!videoRes.ok) {
      const errText = await videoRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Failed to compose video",
          details: errText.slice(0, 4000),
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

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

type Body = {
  videoPublicId: string;          // e.g. "job-posts/unassigned/abc123" (no extension)
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  benefits?: string;
  email?: string;
  phone?: string;
  templateId?: "zitko-1" | "zitko-2";
  templateUrl?: string;           // absolute URL overrides templateId
};

const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
};

// Mirror SocialMediaTab coords/sizes
const LAYOUTS = {
  "zitko-1": {
    title:       { x: 320, y: 125, w: 560, fs: 60, color: "#ffffff", bold: true },
    location:    { x: 520, y: 330, w: 520, fs: 30, color: "#cfd3d7", bold: true },
    salary:      { x: 520, y: 400, w: 520, fs: 28, color: "#cfd3d7", bold: true },
    description: { x: 520, y: 480, w: 520, fs: 24, color: "#ffffff" },
    benefits:    { x: 520, y: 680, w: 520, fs: 24, color: "#ffffff" },
    email:       { x: 800, y: 965,          fs: 20, color: "#cfd3d7" },
    phone:       { x: 800, y: 1020,         fs: 20, color: "#cfd3d7" },
    video:       { x:  80, y: 480, w: 300, h: 300 },
  },
  "zitko-2": {
    title:       { x:  80, y: 320, w: 520, fs: 34, color: "#ffffff", bold: true },
    salary:      { x:  80, y: 370, w: 520, fs: 22, color: "#cfd3d7", bold: true },
    location:    { x:  80, y: 410, w: 520, fs: 20, color: "#cfd3d7", bold: true },
    description: { x:  80, y: 460, w: 520, fs: 18, color: "#ffffff" },
    benefits:    { x:  80, y: 600, w: 520, fs: 18, color: "#ffffff" },
    email:       { x: 800, y: 975,          fs: 20, color: "#cfd3d7" },
    phone:       { x: 800, y: 1030,         fs: 20, color: "#cfd3d7" },
    video:       { x: 720, y: 360, w: 280, h: 360 },
  },
} as const;

function formatBenefits(raw: string) {
  const lines = String(raw || "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
  return lines.length ? "• " + lines.join("\n• ") : "";
}

function stripExt(id: string) {
  return id.replace(/\.(mp4|mov|m4v|webm)$/i, "");
}

// For l_fetch remote overlays
function toBase64Url(s: string) {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const {
      videoPublicId,
      title = "JOB TITLE",
      location = "LOCATION",
      salary = "SALARY",
      description = "SHORT DESCRIPTION",
      benefits = "BENEFITS",
      email = "EMAIL",
      phone = "PHONE",
      templateId = "zitko-1",
      templateUrl,
    } = (await req.json()) as Body;

    if (!videoPublicId) {
      return NextResponse.json({ error: "Missing videoPublicId" }, { status: 400 });
    }

    const cleanVideoId = stripExt(videoPublicId);

    // ----- Build public template URL Cloudinary can fetch -----
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

    // HEAD check for reachability
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

    // Verify video exists & is authenticated
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
    const L = LAYOUTS[templateId] || LAYOUTS["zitko-1"];

    // video slot from layout
    const videoSize = Math.min(L.video.w, L.video.h);
    const videoX = L.video.x;
    const videoY = L.video.y;

    const fetchB64 = toBase64Url(effectiveTemplateUrl);

    const composedUrl = cloudinary.url(cleanVideoId, {
      resource_type: "video",
      type: "authenticated",
      sign_url: true,
      transformation: [
        // 1) Base canvas
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // 2) Template overlay (remote fetch)
        { raw_transformation: `l_fetch:${fetchB64}/c_fill,w_${CANVAS},h_${CANVAS}/fl_layer_apply,g_north_west,x_0,y_0` },

        // 3) Authenticated video overlay
        { raw_transformation: `w_${videoSize},h_${videoSize},c_fill,r_max,l_video:authenticated:${cleanVideoId.replace(/\//g, ":")}` },
        { raw_transformation: `fl_layer_apply,g_north_west,x_${videoX},y_${videoY}` },

        // 4) Text overlays using the same coordinates/fonts as the preview
        // Title
        {
          overlay: { font_family: "Arial", font_size: L.title.fs, font_weight: L.title.bold ? "bold" : "normal", text: title },
          color: L.title.color,
          width: L.title.w,
          crop: "fit",
        },
        { gravity: "north_west", x: L.title.x, y: L.title.y, flags: "layer_apply" },

        // Location
        {
          overlay: { font_family: "Arial", font_size: L.location.fs, font_weight: L.location.bold ? "bold" : "normal", text: location },
          color: L.location.color,
          width: L.location.w,
          crop: "fit",
        },
        { gravity: "north_west", x: L.location.x, y: L.location.y, flags: "layer_apply" },

        // Salary
        {
          overlay: { font_family: "Arial", font_size: L.salary.fs, font_weight: L.salary.bold ? "bold" : "normal", text: salary },
          color: L.salary.color,
          width: L.salary.w,
          crop: "fit",
        },
        { gravity: "north_west", x: L.salary.x, y: L.salary.y, flags: "layer_apply" },

        // Description
        {
          overlay: { font_family: "Arial", font_size: L.description.fs, text: description },
          color: L.description.color,
          width: L.description.w,
          crop: "fit",
        },
        { gravity: "north_west", x: L.description.x, y: L.description.y, flags: "layer_apply" },

        // Benefits (with bullets)
        {
          overlay: { font_family: "Arial", font_size: L.benefits.fs, text: formatBenefits(benefits) },
          color: L.benefits.color,
          width: L.benefits.w,
          crop: "fit",
        },
        { gravity: "north_west", x: L.benefits.x, y: L.benefits.y, flags: "layer_apply" },

        // Email
        {
          overlay: { font_family: "Arial", font_size: L.email.fs, text: email },
          color: L.email.color,
        },
        { gravity: "north_west", x: L.email.x, y: L.email.y, flags: "layer_apply" },

        // Phone
        {
          overlay: { font_family: "Arial", font_size: L.phone.fs, text: phone },
          color: L.phone.color,
        },
        { gravity: "north_west", x: L.phone.x, y: L.phone.y, flags: "layer_apply" },

        // 5) Output
        { fetch_format: "mp4", quality: "auto" },
      ],
    });

    const debug = req.nextUrl.searchParams.get("debug") === "1";
    if (debug) {
      return NextResponse.json(
        {
          composedUrl,
          templateUsed: effectiveTemplateUrl,
          hint: "Open composedUrl in a new tab. If it errors, check 'Allowed fetch domains' and x-cld-error.",
        },
        { status: 200 }
      );
    }

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

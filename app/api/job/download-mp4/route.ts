import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

/**
 * Updated Cloudinary MP4 composer for social media posts.
 *
 * This handler accepts a JSON payload describing a recorded video and
 * optional overrides for text positions, font sizes and the video slot. It
 * produces an authenticated Cloudinary transformation that composites the
 * selected template, video and text overlays into a single MP4.  The
 * transformation mirrors the on‑page preview used to generate PNGs so
 * dragging text up/down and resizing fonts on the client will be respected
 * when generating the MP4.
 */
export const runtime = "nodejs";

// Configure Cloudinary using environment variables.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ||
              process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

// Define the placeholders and request body.
type PlaceholderKey =
  | "title" | "location" | "salary" | "description"
  | "benefits" | "email" | "phone";

interface Body {
  videoPublicId: string;
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  benefits?: string;
  email?: string;
  phone?: string;
  templateId?: "zitko-1" | "zitko-2";
  positions?: Partial<Record<PlaceholderKey, { x: number; y: number }>>;
  fontSizes?: Partial<Record<PlaceholderKey, number>>;
  videoPos?: { x: number; y: number };
  templateUrl?: string;
}

const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
};

// Base layout definitions.
type TextBox = { x:number; y:number; w:number; h?:number; fs:number; color:string; bold?:boolean };
type VideoBox = { x:number; y:number; w:number; h:number };
interface Layout {
  title: TextBox; location: TextBox; salary: TextBox;
  description: TextBox; benefits: TextBox;
  email: TextBox; phone: TextBox;
  video: VideoBox;
}
const LAYOUTS: Record<"zitko-1" | "zitko-2", Layout> = {
  "zitko-1": {
    title:       { x:470, y:100, w:560, fs:60, color:"#ffffff", bold:true },
    location:    { x:520, y:330, w:520, fs:30, color:"#ffffff", bold:true },
    salary:      { x:520, y:400, w:520, fs:28, color:"#F7941D", bold:true },
    description: { x:520, y:480, w:520, h:80, fs:24, color:"#ffffff" },
    benefits:    { x:520, y:650, w:520, h:260, fs:24, color:"#ffffff" },
    email:       { x:800, y:962, w:180, fs:20, color:"#ffffff" },
    phone:       { x:800, y:1018, w:180, fs:20, color:"#ffffff" },
    video:       { x:80, y:400, w:300, h:300 },
  },
  "zitko-2": {
    title:       { x:30,  y:370, w:520, fs:60, color:"#ffffff", bold:true },
    location:    { x:80,  y:480, w:520, fs:30, color:"#ffffff", bold:true },
    salary:      { x:80,  y:530, w:520, fs:28, color:"#F7941D", bold:true },
    description: { x:80,  y:580, w:520, h:120, fs:24, color:"#ffffff" },
    benefits:    { x:80,  y:750, w:520, h:260, fs:24, color:"#ffffff" },
    email:       { x:800, y:962, w:180, fs:20, color:"#ffffff" },
    phone:       { x:800, y:1018, w:180, fs:20, color:"#ffffff" },
    video:       { x:705, y:540, w:300, h:300 },
  },
};

function formatBenefits(raw: string): string {
  const lines = String(raw || "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
  return lines.length ? "• " + lines.join("\n• ") : "";
}
function stripExt(id:string): string {
  return id.replace(/\.(mp4|mov|m4v|webm)$/i, "");
}
function toBase64Url(s:string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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
      positions = {},
      fontSizes = {},
      videoPos,
    } = (await req.json()) as Body;

    if (!videoPublicId) {
      return NextResponse.json({ error: "Missing videoPublicId" }, { status: 400 });
    }
    const cleanVideoId = stripExt(videoPublicId);

    // Derive template URL; allow override via templateUrl.
    let effectiveTemplateUrl = templateUrl?.trim();
    const originFromReq = req.nextUrl.origin;
    const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const isLocal = /^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(originFromReq);
    if (!effectiveTemplateUrl) {
      const filename = TEMPLATE_FILES[templateId] || TEMPLATE_FILES["zitko-1"];
      const baseForCloudinary = isLocal ? envBase : originFromReq;
      if (!baseForCloudinary) {
        return NextResponse.json(
          { error: "No public base URL. Set NEXT_PUBLIC_BASE_URL or pass templateUrl." },
          { status: 500 },
        );
      }
      effectiveTemplateUrl = `${baseForCloudinary.replace(/\/$/, "")}/templates/${filename}`;
    }

    // Validate the template exists.
    try {
      const head = await fetch(effectiveTemplateUrl, { method:"HEAD", cache:"no-store" });
      if (!head.ok) {
        return NextResponse.json(
          { error: "Template PNG not reachable (HEAD failed)",
            status: head.status, templateUrl: effectiveTemplateUrl },
          { status: 502 },
        );
      }
      const ct = head.headers.get("content-type") || "";
      if (!ct.includes("image")) {
        return NextResponse.json(
          { error: "Template URL did not return an image content-type",
            contentType: ct, templateUrl: effectiveTemplateUrl },
          { status: 502 },
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: "Failed to reach template URL",
          templateUrl: effectiveTemplateUrl, details: e?.message },
        { status: 502 },
      );
    }

    // Verify the video exists in Cloudinary.
    try {
      // @ts-ignore
      const info = await cloudinary.api.resource(cleanVideoId, {
        resource_type: "video",
        type: "authenticated",
      });
      if (!info || info.type !== "authenticated") {
        return NextResponse.json(
          { error: "Cloudinary video found but not 'authenticated' type",
            foundType: info?.type, publicId: cleanVideoId },
          { status: 404 },
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: "Cloudinary video not found",
          publicId: cleanVideoId, details: e?.message },
        { status: 404 },
      );
    }

    // Build effective layout (apply overrides).
    const CANVAS = 1080;
    const baseLayout = LAYOUTS[templateId] || LAYOUTS["zitko-1"];
    const effectiveLayout: Layout = {
      title:       { ...baseLayout.title },
      location:    { ...baseLayout.location },
      salary:      { ...baseLayout.salary },
      description: { ...baseLayout.description },
      benefits:    { ...baseLayout.benefits },
      email:       { ...baseLayout.email },
      phone:       { ...baseLayout.phone },
      video:       { ...baseLayout.video },
    };

    (Object.keys(positions) as PlaceholderKey[]).forEach(key => {
      const ov = positions[key];
      if (ov) {
        (effectiveLayout as any)[key].x = ov.x ?? (effectiveLayout as any)[key].x;
        (effectiveLayout as any)[key].y = ov.y ?? (effectiveLayout as any)[key].y;
      }
    });
    (Object.keys(fontSizes) as PlaceholderKey[]).forEach(key => {
      const fs = fontSizes[key];
      if (typeof fs === "number" && Number.isFinite(fs) && fs > 0) {
        (effectiveLayout as any)[key].fs = fs;
      }
    });
    if (videoPos) {
      effectiveLayout.video.x = videoPos.x ?? effectiveLayout.video.x;
      effectiveLayout.video.y = videoPos.y ?? effectiveLayout.video.y;
    }

    const fetchB64 = toBase64Url(effectiveTemplateUrl);
    const overlayIdForLayer = cleanVideoId.replace(/\//g, ":");
    const videoSize = Math.min(effectiveLayout.video.w, effectiveLayout.video.h);

    const transformations: any[] = [];
    transformations.push({ width: CANVAS, height: CANVAS, crop: "fill" });
    transformations.push({ raw_transformation:
      `l_fetch:${fetchB64}/c_fill,w_${CANVAS},h_${CANVAS}/fl_layer_apply,g_north_west,x_0,y_0` });
    transformations.push({ raw_transformation:
      `w_${videoSize},h_${videoSize},c_fill,l_video:authenticated:${overlayIdForLayer}` });
    transformations.push({ raw_transformation:
      `fl_layer_apply,g_north_west,x_${effectiveLayout.video.x},y_${effectiveLayout.video.y}` });

    function addTextOverlay(key: PlaceholderKey, value: string) {
      const spec = (effectiveLayout as any)[key] as TextBox;
      const overlayCfg: any = {
        overlay: {
          font_family: "Arial",
          font_size: spec.fs,
          font_weight: spec.bold ? "bold" : "normal",
          text: value,
          text_align: "left",
        },
        color: spec.color,
        width: spec.w,
        crop: "fit",
      };
      if (spec.h) {
        overlayCfg.height = spec.h;
      }
      transformations.push(overlayCfg);
      transformations.push({ gravity: "north_west", x: spec.x, y: spec.y,
                             flags: "layer_apply" });
    }

    const cleanDescription = String(description || "")
      .replace(/\r\n|\r|\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const cleanBenefits = String(benefits || "").trim();

    addTextOverlay("title", title);
    addTextOverlay("location", location);
    addTextOverlay("salary", salary);
    addTextOverlay("description", cleanDescription);
    addTextOverlay("benefits", formatBenefits(cleanBenefits));
    addTextOverlay("email", email);
    addTextOverlay("phone", phone);

    transformations.push({ fetch_format:"mp4", quality:"auto" });

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
          templateUsed: effectiveTemplateUrl,
          hint: "Open composedUrl in a new tab if you need to inspect Cloudinary output directly.",
        },
        { status: 200 },
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
        { status: 500 },
      );
    }

    const bodyBuf = Buffer.from(await videoRes.arrayBuffer());
    return new NextResponse(bodyBuf, {
      headers: {
        "Content-Type":"video/mp4",
        "Content-Length": String(bodyBuf.length),
        "Content-Disposition": 'attachment; filename="job-post.mp4"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" },
                             { status: 500 });
  }
}

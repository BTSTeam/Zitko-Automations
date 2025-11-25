import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary MP4 composer for social media job posts.
 * - Takes a recorded video (videoPublicId)
 * - Composites it with the static PNG template
 * - Adds all text fields at positions matching the live preview
 * - Respects dragged positions + font size changes from the UI
 * - Adds the location icon + circular video mask
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

// ---------------- Types / constants ----------------

const BRAND_ORANGE = "#F7941D";
const TSI_RED = "#C6242A";

type PlaceholderKey =
  | "title"
  | "location"
  | "salary"
  | "description"
  | "benefits"
  | "email"
  | "phone";

type TemplateId = "zitko-1" | "zitko-2" | "zitko-4"; 

interface Body {
  videoPublicId: string;
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  benefits?: string;
  email?: string;
  phone?: string;
  templateId?: TemplateId;
  positions?: Partial<Record<PlaceholderKey, { x: number; y: number }>>;
  fontSizes?: Partial<Record<PlaceholderKey, number>>;
  videoPos?: { x: number; y: number };
  templateUrl?: string;
}

const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
  "zitko-4": "TSI-Video.png",
};

type TextBox = {
  x: number;
  y: number;
  w: number;
  h?: number;
  fs: number;
  color: string;
  bold?: boolean;
  align?: "left" | "right" | "center";
};

type VideoBox = { x: number; y: number; w: number; h: number };

interface Layout {
  title: TextBox;
  location: TextBox;
  salary: TextBox;
  description: TextBox;
  benefits: TextBox;
  email: TextBox;
  phone: TextBox;
  video: VideoBox;
}

// These mirror SocialMediaTab template layouts (positions + base sizes)
const LAYOUTS: Record<TemplateId, Layout> = {
  "zitko-1": {
    title: {
      x: 470,
      y: 100,
      w: 560,
      fs: 60,
      color: "#ffffff",
      bold: true,
      align: "left",
    },
    location: {
      x: 520,
      y: 330,
      w: 520,
      fs: 30,
      color: "#ffffff",
      bold: true,
      align: "left",
    },
    salary: {
      x: 520,
      y: 400,
      w: 520,
      fs: 28,
      color: BRAND_ORANGE,
      bold: true,
      align: "left",
    },
    description: {
      x: 520,
      y: 480,
      w: 520,
      h: 80,
      fs: 24,
      color: "#ffffff",
      align: "left",
    },
    benefits: {
      x: 520,
      y: 650,
      w: 520,
      h: 260,
      fs: 24,
      color: "#ffffff",
      align: "left",
    },
    email: {
      x: 800,
      y: 962,
      w: 180,
      fs: 20,
      color: "#ffffff",
      align: "left",
    },
    phone: {
      x: 800,
      y: 1018,
      w: 180,
      fs: 20,
      color: "#ffffff",
      align: "left",
    },
    video: { x: 80, y: 400, w: 300, h: 300 },
  },
  "zitko-2": {
    title: {
      x: 30,
      y: 380,
      w: 520,
      fs: 60,
      color: "#ffffff",
      bold: true,
      align: "left",
    },
    location: {
      x: 90,
      y: 500,
      w: 520,
      fs: 30,
      color: "#ffffff",
      bold: true,
      align: "left",
    },
    salary: {
      x: 90,
      y: 540,
      w: 520,
      fs: 28,
      color: BRAND_ORANGE,
      bold: true,
      align: "left",
    },
    description: {
      x: 90,
      y: 600,
      w: 540,
      h: 120,
      fs: 24,
      color: "#ffffff",
      align: "left",
    },
    benefits: {
      x: 90,
      y: 770,
      w: 540,
      h: 260,
      fs: 24,
      color: "#ffffff",
      align: "left",
    },
    email: {
      x: 800,
      y: 978,
      w: 180,
      fs: 20,
      color: "#ffffff",
      align: "left",
    },
    phone: {
      x: 800,
      y: 1035,
      w: 180,
      fs: 20,
      color: "#ffffff",
      align: "left",
    },
    video: { x: 704, y: 540, w: 300, h: 300 },
  },
  "zitko-4": {
    title: {
      x: 40,
      y: 350,
      w: 720,
      fs: 60,
      color: "#ffffff",
      bold: true,
      align: "left",
    },
    location: {
      x: 80,
      y: 440,
      w: 720,
      fs: 30,
      color: "#ffffff",
      bold: true,
      align: "left",
    },
    salary: {
      x: 80,
      y: 490,
      w: 520,
      fs: 28,
      color: TSI_RED, // TSI red salary
      bold: true,
      align: "left",
    },
    description: {
      x: 80,
      y: 540,
      w: 620,
      h: 120,
      fs: 24,
      color: "#ffffff",
      align: "left",
    },
    benefits: {
      x: 80,
      y: 730,
      w: 610,
      h: 260,
      fs: 24,
      color: "#ffffff",
      align: "left",
    },
    email: {
      x: 800,
      y: 957,
      w: 180,
      fs: 20,
      color: "#ffffff",
      align: "left",
    },
    phone: {
      x: 800,
      y: 1018,
      w: 180,
      fs: 20,
      color: "#ffffff",
      align: "left",
    },
    video: { x: 712, y: 60, w: 300, h: 300 },
  },
};

// ---------------- Helpers ----------------

function formatBullets(raw: string): string {
  const lines = String(raw || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length ? "• " + lines.join("\n• ") : "";
}

function stripExt(id: string): string {
  return id.replace(/\.(mp4|mov|m4v|webm)$/i, "");
}

function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// ---------------- Handler ----------------

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
      return NextResponse.json(
        { error: "Missing videoPublicId" },
        { status: 400 },
      );
    }

    console.log("MP4 payload text:", {
      description,
      benefits,
      templateId,
    });

    const cleanVideoId = stripExt(videoPublicId);

    // ----- Build effective template URL -----
    let effectiveTemplateUrl = templateUrl?.trim();
    const originFromReq = req.nextUrl.origin;
    const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const isLocal = /^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(
      originFromReq,
    );

    if (!effectiveTemplateUrl) {
      const filename = TEMPLATE_FILES[templateId] || TEMPLATE_FILES["zitko-1"];
      const baseForCloudinary = isLocal ? envBase : originFromReq;
      if (!baseForCloudinary) {
        return NextResponse.json(
          {
            error:
              "No public base URL. Set NEXT_PUBLIC_BASE_URL or pass templateUrl.",
          },
          { status: 500 },
        );
      }
      effectiveTemplateUrl = `${baseForCloudinary.replace(
        /\/$/,
        "",
      )}/templates/${filename}`;
    }

    // derive base origin for other assets (location icon)
    let assetsOrigin: string | null = null;
    try {
      const u = new URL(effectiveTemplateUrl);
      assetsOrigin = u.origin;
    } catch {
      assetsOrigin = originFromReq;
    }

    const locationIconPath =
      templateId === "zitko-4"
        ? "/templates/TSI-Location-Icon.png"
        : "/templates/Location-Icon.png";

    const locationIconUrl = assetsOrigin
      ? `${assetsOrigin.replace(/\/$/, "")}${locationIconPath}`
      : null;

    // ----- Sanity-check template URL -----
    try {
      const head = await fetch(effectiveTemplateUrl, {
        method: "HEAD",
        cache: "no-store",
      });
      if (!head.ok) {
        return NextResponse.json(
          {
            error: "Template PNG not reachable (HEAD failed)",
            status: head.status,
            templateUrl: effectiveTemplateUrl,
          },
          { status: 502 },
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
          { status: 502 },
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Failed to reach template URL",
          templateUrl: effectiveTemplateUrl,
          details: e?.message,
        },
        { status: 502 },
      );
    }

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
          { status: 404 },
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "Cloudinary video not found",
          publicId: cleanVideoId,
          details: e?.message,
        },
        { status: 404 },
      );
    }

    // ----- Build effective layout (apply overrides from the UI) -----
    const CANVAS = 1080;
    const baseLayout = LAYOUTS[templateId] || LAYOUTS["zitko-1"];

    const effectiveLayout: Layout = {
      title: { ...baseLayout.title },
      location: { ...baseLayout.location },
      salary: { ...baseLayout.salary },
      description: { ...baseLayout.description },
      benefits: { ...baseLayout.benefits },
      email: { ...baseLayout.email },
      phone: { ...baseLayout.phone },
      video: { ...baseLayout.video },
    };

    // apply dragged text overrides
    (Object.keys(positions) as PlaceholderKey[]).forEach((key) => {
      const ov = positions[key];
      if (ov) {
        (effectiveLayout as any)[key].x =
          ov.x ?? (effectiveLayout as any)[key].x;
        (effectiveLayout as any)[key].y =
          ov.y ?? (effectiveLayout as any)[key].y;
      }
    });

    // apply font size overrides
    (Object.keys(fontSizes) as PlaceholderKey[]).forEach((key) => {
      const fs = fontSizes[key];
      if (typeof fs === "number" && Number.isFinite(fs) && fs > 0) {
        (effectiveLayout as any)[key].fs = fs;
      }
    });

    // apply dragged video overrides
    if (videoPos) {
      effectiveLayout.video.x = videoPos.x ?? effectiveLayout.video.x;
      effectiveLayout.video.y = videoPos.y ?? effectiveLayout.video.y;
    }

    const fetchB64 = toBase64Url(effectiveTemplateUrl);
    const overlayIdForLayer = cleanVideoId.replace(/\//g, ":");
    const videoSize = Math.min(
      effectiveLayout.video.w,
      effectiveLayout.video.h,
    );

    // ----- Build Cloudinary transformation -----
    const transformations: any[] = [];

    // 1) Base canvas
    transformations.push({
      width: CANVAS,
      height: CANVAS,
      crop: "fill",
    });

    // 2) Static PNG template (remote fetch)
    transformations.push({
      raw_transformation: `l_fetch:${fetchB64}/c_fill,w_${CANVAS},h_${CANVAS}/fl_layer_apply,g_north_west,x_0,y_0`,
    });

    // 3) Video overlay (circular mask)
    transformations.push({
      overlay: `video:authenticated:${overlayIdForLayer}`,
      width: videoSize,
      height: videoSize,
      crop: "fill",
      radius: "max", // circular mask
    });
    transformations.push({
      gravity: "north_west",
      x: effectiveLayout.video.x,
      y: effectiveLayout.video.y,
      flags: "layer_apply",
    });

    // 4) Location icon overlay via l_fetch (matches React preview maths)
    if (locationIconUrl && 
      templateId !== "zitko-2" &&
      templateId !== "zitko-4") {
      // z2 has no icon
      const locSpec = effectiveLayout.location;
      const locationFontSize = locSpec.fs;
      const textHeight = locationFontSize * 1.25;
      const iconSize = 40;
      const iconOffsetX = 50;
      const iconOffsetY = 15;
      const locY = locSpec.y;

      const iconX = locSpec.x - iconOffsetX;
      const iconY = locY + (textHeight - iconSize) + iconOffsetY;

      const iconFetch = toBase64Url(locationIconUrl);

      transformations.push({
        raw_transformation:
          `l_fetch:${iconFetch}` +
          `/c_scale,w_${iconSize},h_${iconSize}` +
          `/fl_layer_apply,g_north_west,x_${iconX},y_${iconY}`,
      });
    }

    function addTextOverlay(key: PlaceholderKey, value: string) {
      const spec = (effectiveLayout as any)[key] as TextBox;

      const safeText = String(value || "").trim();
      if (!safeText) return; // nothing to draw

      const isZ2 = templateId === "zitko-2";
      const isTitle = key === "title";

      const overlayCfg: any = {
        overlay: {
          font_family: "Arial",
          font_size: spec.fs,
          font_weight: spec.bold ? "bold" : "normal",
          text: safeText,
          text_align: spec.align || "left",
        },
        color: spec.color,
        crop: "fit",
      };

      // same width logic as title/location/salary
      if (!(isZ2 && isTitle) && spec.w) {
        overlayCfg.width = spec.w;
      }

      if (spec.h) {
        overlayCfg.height = spec.h;
      }

      transformations.push(overlayCfg);
      transformations.push({
        gravity: "north_west",
        x: spec.x,
        y: spec.y,
        flags: "layer_apply",
      });
    }

    function addHeadingPlusBullets(
      key: PlaceholderKey,
      heading: string,
      bullets: string,
    ) {
      const spec = (effectiveLayout as any)[key] as TextBox;

      const headingText = heading.trim();
      const bulletsText = String(bullets || "").trim();
      if (!headingText && !bulletsText) return;

      const gap = spec.fs * 1.2;

      // heading in TSI red
      if (headingText) {
        const headingCfg: any = {
          overlay: {
            font_family: "Arial",
            font_size: spec.fs,
            font_weight: "bold",
            text: headingText,
            text_align: spec.align || "left",
          },
          color: TSI_RED,
          crop: "fit",
        };
        if (spec.w) headingCfg.width = spec.w;

        transformations.push(headingCfg);
        transformations.push({
          gravity: "north_west",
          x: spec.x,
          y: spec.y,
          flags: "layer_apply",
        });
      }

      // bullets in white, below heading
      if (bulletsText) {
        const bulletsCfg: any = {
          overlay: {
            font_family: "Arial",
            font_size: spec.fs,
            font_weight: "normal",
            text: bulletsText,
            text_align: spec.align || "left",
          },
          color: "#ffffff",
          crop: "fit",
        };
        if (spec.w) bulletsCfg.width = spec.w;
        if (spec.h) bulletsCfg.height = spec.h;

        transformations.push(bulletsCfg);
        transformations.push({
          gravity: "north_west",
          x: spec.x,
          y: spec.y + gap,
          flags: "layer_apply",
        });
      }
    }

    // ---- Prepare description + benefits cleanly ----
    // Start with raw values from the payload
    let rawDesc = String(description || "").trim();
    let rawBenefits = String(benefits || "").trim();

    // If description accidentally came through as JSON that contains
    // { "description": "...", "benefits": "..." } we recover from it.
    if (rawDesc.startsWith("{") && rawDesc.includes("description")) {
      try {
        const parsed = JSON.parse(rawDesc);
        if (typeof parsed.description === "string") {
          rawDesc = parsed.description;
        }
        if (!rawBenefits && typeof parsed.benefits === "string") {
          rawBenefits = parsed.benefits;
        }
      } catch {
        // ignore JSON parse errors, fall back to rawDesc/rawBenefits
      }
    }

    const cleanDescription = rawDesc
      .replace(/\r\n|\r/g, "\n") // normalise newlines
      .replace(/\s+$/g, "")
      .trim();

    const benefitsRaw = rawBenefits || "BENEFITS";

    // For benefits we always want standard bullets
    const formattedBenefits = formatBullets(benefitsRaw);

    // For TSI video (zitko-4) we DO NOT add bullets here – we keep
    // the lines as-is. Other templates still get bullet formatting.
    const responsibilitiesText =
      templateId === "zitko-4"
        ? cleanDescription
        : formatBullets(cleanDescription || "RESPONSIBILITIES");

    // ---- Add ALL text layers (including description + benefits) ----
    addTextOverlay("title", title);
    addTextOverlay("location", location);
    addTextOverlay("salary", salary);

    if (templateId === "zitko-4") {
      // TSI video:
      // - RESPONSIBILITIES heading in red + plain lines beneath
      // - BENEFITS heading in red + bullet list beneath
      addHeadingPlusBullets(
        "description",
        "RESPONSIBILITIES",
        responsibilitiesText,
      );
      addHeadingPlusBullets("benefits", "BENEFITS", formattedBenefits);
    } else {
      // Normal templates
      addTextOverlay("description", cleanDescription);
      addTextOverlay("benefits", formattedBenefits);
    }

    addTextOverlay("email", email);
    addTextOverlay("phone", phone);

    // 6) Export as MP4
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
          templateUsed: effectiveTemplateUrl,
          locationIconUrl,
          descriptionUsed: cleanDescription,
          benefitsUsed: formattedBenefits,
          responsibilitiesUsed: formattedResponsibilities,
          hint: "Open composedUrl in a new tab if you need to inspect Cloudinary output directly.",
        },
        { status: 200 },
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
          templateUsed: effectiveTemplateUrl,
        },
        { status: 500 },
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
      { status: 500 },
    );
  }
}

// app/api/job/download-mp4/route.ts
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

// ---------- layout + body types ----------

type TextBox = {
  x: number;
  y: number;
  w: number;
  fs: number;
  color: string;
  bold?: boolean;
  h?: number;
};
type VideoBox = { x: number; y: number; w: number; h: number };
type Layout = {
  title: TextBox;
  location: TextBox;
  salary: TextBox;
  description: TextBox;
  benefits: TextBox;
  email: TextBox;
  phone: TextBox;
  video: VideoBox;
};

type PositionMap = Record<string, { x: number; y: number }>;
type FontSizeMap = Record<string, number>;

type Body = {
  videoPublicId: string;
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  benefits?: string;
  email?: string;
  phone?: string;
  templateId?: "zitko-1" | "zitko-2";
  templateUrl?: string;
  // NEW – overrides from the React preview
  positions?: PositionMap;
  fontSizes?: FontSizeMap;
  videoPos?: { x: number; y: number } | null;
};

const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
};

// These are aligned with your SocialMediaTab TEMPLATES defaults
const LAYOUTS: Record<"zitko-1" | "zitko-2", Layout> = {
  "zitko-1": {
    title: {
      x: 470,
      y: 100,
      w: 560,
      fs: 60,
      color: "#ffffff",
      bold: true,
    },
    location: {
      x: 520,
      y: 330,
      w: 520,
      fs: 30,
      color: "#ffffff",
      bold: true,
    },
    salary: {
      x: 520,
      y: 400,
      w: 520,
      fs: 28,
      color: "#F7941D",
      bold: true,
    },
    description: {
      x: 520,
      y: 480,
      w: 520,
      h: 80,
      fs: 24,
      color: "#ffffff",
    },
    benefits: {
      x: 520,
      y: 650,
      w: 520,
      h: 260,
      fs: 24,
      color: "#ffffff",
    },
    email: {
      x: 800,
      y: 962,
      w: 180,
      fs: 20,
      color: "#ffffff",
    },
    phone: {
      x: 800,
      y: 1018,
      w: 180,
      fs: 20,
      color: "#ffffff",
    },
    video: { x: 80, y: 400, w: 300, h: 300 },
  },
  "zitko-2": {
    title: {
      x: 80,
      y: 380,
      w: 960,
      fs: 60,
      color: "#ffffff",
      bold: true,
    },
    location: {
      x: 80,
      y: 480,
      w: 520,
      fs: 30,
      color: "#ffffff",
      bold: true,
    },
    salary: {
      x: 80,
      y: 530,
      w: 520,
      fs: 28,
      color: "#F7941D",
      bold: true,
    },
    description: {
      x: 80,
      y: 580,
      w: 520,
      h: 120,
      fs: 24,
      color: "#ffffff",
    },
    benefits: {
      x: 80,
      y: 750,
      w: 520,
      h: 260,
      fs: 24,
      color: "#ffffff",
    },
    email: {
      x: 800,
      y: 962,
      w: 180,
      fs: 20,
      color: "#ffffff",
    },
    phone: {
      x: 800,
      y: 1018,
      w: 180,
      fs: 20,
      color: "#ffffff",
    },
    video: { x: 750, y: 400, w: 300, h: 300 },
  },
};

function formatBenefits(raw: string) {
  const lines = String(raw || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length ? "• " + lines.join("\n• ") : "";
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
      benefits = "BENEFITS",
      email = "EMAIL",
      phone = "PHONE",
      templateId = "zitko-1",
      templateUrl,
      positions,
      fontSizes,
      videoPos,
    } = (await req.json()) as Body;

    // Sanitize description
    const cleanDescription = String(description || "")
      .replace(/\r\n|\r|\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const cleanBenefits = String(benefits || "").trim();

    if (!videoPublicId) {
      return NextResponse.json(
        { error: "Missing videoPublicId" },
        { status: 400 },
      );
    }

    const cleanVideoId = stripExt(videoPublicId);

    // Build public template URL
    const originFromReq = req.nextUrl.origin;
    const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    const isLocal = /^(http:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(
      originFromReq,
    );

    let effectiveTemplateUrl = templateUrl?.trim();
    if (!effectiveTemplateUrl) {
      const filename =
        TEMPLATE_FILES[templateId] || TEMPLATE_FILES["zitko-1"];
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

    // HEAD check template
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
            error:
              "Template URL did not return an image content-type",
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

    // Verify video exists & is authenticated
    try {
      // @ts-ignore
      const info = await cloudinary.api.resource(cleanVideoId, {
        resource_type: "video",
        type: "authenticated",
      });
      if (!info || info.type !== "authenticated") {
        return NextResponse.json(
          {
            error:
              "Cloudinary video found but not 'authenticated' type",
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

    const CANVAS = 1080;

    // Start from default layout and apply overrides from UI
    const baseLayout = LAYOUTS[templateId] || LAYOUTS["zitko-1"];
    const E: Layout = JSON.parse(JSON.stringify(baseLayout));

    // Apply position overrides for text boxes
    if (positions) {
      for (const [key, pos] of Object.entries(positions)) {
        if ((E as any)[key] && typeof pos?.x === "number" && typeof pos?.y === "number") {
          (E as any)[key].x = pos.x;
          (E as any)[key].y = pos.y;
        }
      }
    }

    // Apply font-size overrides
    if (fontSizes) {
      for (const [key, fs] of Object.entries(fontSizes)) {
        if ((E as any)[key] && typeof fs === "number" && fs > 0) {
          (E as any)[key].fs = fs;
        }
      }
    }

    // Apply video position override
    if (videoPos && typeof videoPos.x === "number" && typeof videoPos.y === "number") {
      E.video.x = videoPos.x;
      E.video.y = videoPos.y;
    }

    const overlayIdForLayer = cleanVideoId.replace(/\//g, ":");
    const videoSize = Math.min(E.video.w, E.video.h);

    // Build Cloudinary transformation
    const composedUrl = cloudinary.url(cleanVideoId, {
      resource_type: "video",
      type: "authenticated",
      sign_url: true,
      transformation: [
        // base canvas
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // template PNG over the top
        {
          overlay: { url: effectiveTemplateUrl },
          width: CANVAS,
          height: CANVAS,
          crop: "fill",
        },
        {
          gravity: "north_west",
          x: 0,
          y: 0,
          flags: "layer_apply",
        },

        // video into slot – use overlay object, not raw_transformation
        {
          overlay: `video:authenticated:${overlayIdForLayer}`,
          width: videoSize,
          height: videoSize,
          crop: "fill",
          radius: "max",
        },
        {
          gravity: "north_west",
          x: E.video.x,
          y: E.video.y,
          flags: "layer_apply",
        },

        // TITLE
        {
          overlay: {
            font_family: "Arial",
            font_size: E.title.fs,
            font_weight: E.title.bold ? "bold" : "normal",
            text: title,
            text_align: "left",
          },
          color: E.title.color,
          width: E.title.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: E.title.x,
          y: E.title.y,
          flags: "layer_apply",
        },

        // LOCATION
        {
          overlay: {
            font_family: "Arial",
            font_size: E.location.fs,
            font_weight: E.location.bold ? "bold" : "normal",
            text: location,
            text_align: "left",
          },
          color: E.location.color,
          width: E.location.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: E.location.x,
          y: E.location.y,
          flags: "layer_apply",
        },

        // SALARY
        {
          overlay: {
            font_family: "Arial",
            font_size: E.salary.fs,
            font_weight: E.salary.bold ? "bold" : "normal",
            text: salary,
            text_align: "left",
          },
          color: E.salary.color,
          width: E.salary.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: E.salary.x,
          y: E.salary.y,
          flags: "layer_apply",
        },

        // DESCRIPTION
        {
          overlay: {
            font_family: "Arial",
            font_size: E.description.fs,
            text: cleanDescription,
            text_align: "left",
          },
          color: E.description.color,
          width: E.description.w,
          height: E.description.h,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: E.description.x,
          y: E.description.y,
          flags: "layer_apply",
        },

        // BENEFITS
        {
          overlay: {
            font_family: "Arial",
            font_size: E.benefits.fs,
            text: formatBenefits(cleanBenefits),
            text_align: "left",
            line_spacing: 6,
          },
          color: E.benefits.color,
          width: E.benefits.w,
          height: E.benefits.h,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: E.benefits.x,
          y: E.benefits.y,
          flags: "layer_apply",
        },

        // EMAIL
        {
          overlay: {
            font_family: "Arial",
            font_size: E.email.fs,
            text: email,
            text_align: "left",
          },
          color: E.email.color,
          width: E.email.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: E.email.x,
          y: E.email.y,
          flags: "layer_apply",
        },

        // PHONE
        {
          overlay: {
            font_family: "Arial",
            font_size: E.phone.fs,
            text: phone,
            text_align: "left",
          },
          color: E.phone.color,
          width: E.phone.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: E.phone.x,
          y: E.phone.y,
          flags: "layer_apply",
        },

        { fetch_format: "mp4", quality: "auto" },
      ],
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
      const cldError =
        videoRes.headers.get("x-cld-error") || undefined;
      return NextResponse.json(
        {
          error:
            cldError || "Failed to compose video (see details)",
          status: videoRes.status,
          cloudinaryError: cldError,
          details: errText.slice(0, 2000),
          composedUrl,
          templateUsed: effectiveTemplateUrl,
        },
        { status: 500 },
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
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 },
    );
  }
}

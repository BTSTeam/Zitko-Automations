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
};

const TEMPLATE_FILES: Record<string, string> = {
  "zitko-1": "zitko-dark-arc.png",
  "zitko-2": "zitko-looking.png",
};

// ---------- Layout types + maps ----------
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

// These are aligned with your current SocialMediaTab TEMPLATES
const LAYOUTS: Record<"zitko-1" | "zitko-2", Layout> = {
  "zitko-1": {
    // SocialMediaTab:
    // title: { x: 470, y: 100, w: 560, fontSize: 60 }
    title: {
      x: 470,
      y: 100,
      w: 560,
      fs: 60,
      color: "#ffffff",
      bold: true,
    },
    // location: { x: 520, y: 330, w: 520, fontSize: 30 }
    location: {
      x: 520,
      y: 330,
      w: 520,
      fs: 30,
      color: "#ffffff",
      bold: true,
    },
    // salary: { x: 520, y: 400, w: 520, fontSize: 28 }
    salary: {
      x: 520,
      y: 400,
      w: 520,
      fs: 28,
      color: "#F7941D", // orange to match PNG
      bold: true,
    },
    // description: { x: 520, y: 480, w: 520, h: 80, fontSize: 24 }
    description: {
      x: 520,
      y: 480,
      w: 520,
      h: 80,
      fs: 24,
      color: "#ffffff",
    },
    // benefits: { x: 520, y: 650, w: 520, h: 260, fontSize: 24 }
    benefits: {
      x: 520,
      y: 650,
      w: 520,
      h: 260,
      fs: 24,
      color: "#ffffff",
    },
    // email: { x: 800, y: 962, w: 180, fontSize: 20 }
    email: {
      x: 800,
      y: 962,
      w: 180,
      fs: 20,
      color: "#ffffff",
    },
    // phone: { x: 800, y: 1018, w: 180, fontSize: 20 }
    phone: {
      x: 800,
      y: 1018,
      w: 180,
      fs: 20,
      color: "#ffffff",
    },
    // video: { x: 80, y: 400, w: 300, h: 300 }
    video: { x: 80, y: 400, w: 300, h: 300 },
  },
  "zitko-2": {
    // SocialMediaTab:
    // title: { x: 80, y: 380, fontSize: 60 }
    // width in React = template.width - x - 40 = 1080 - 80 - 40 = 960
    title: {
      x: 80,
      y: 380,
      w: 960, // full width to match PNG
      fs: 60,
      color: "#ffffff",
      bold: true,
    },
    // location: { x: 80, y: 480, w: 520, fontSize: 30 }
    location: {
      x: 80,
      y: 480,
      w: 520,
      fs: 30,
      color: "#ffffff",
      bold: true,
    },
    // salary: { x: 80, y: 530, w: 520, fontSize: 28 }
    salary: {
      x: 80,
      y: 530,
      w: 520,
      fs: 28,
      color: "#F7941D", // orange
      bold: true,
    },
    // description: { x: 80, y: 580, w: 520, h: 120, fontSize: 24 }
    description: {
      x: 80,
      y: 580,
      w: 520,
      h: 120,
      fs: 24,
      color: "#ffffff",
    },
    // benefits: { x: 80, y: 750, w: 520, h: 260, fontSize: 24 }
    benefits: {
      x: 80,
      y: 750,
      w: 520,
      h: 260,
      fs: 24,
      color: "#ffffff",
    },
    // email: { x: 800, y: 962, w: 180, fontSize: 20 }
    email: {
      x: 800,
      y: 962,
      w: 180,
      fs: 20,
      color: "#ffffff",
    },
    // phone: { x: 800, y: 1018, w: 180, fontSize: 20 }
    phone: {
      x: 800,
      y: 1018,
      w: 180,
      fs: 20,
      color: "#ffffff",
    },
    // video: { x: 750, y: 400, w: 300, h: 300 }
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

    // Sanitize description to avoid manual line breaks
    const cleanDescription = String(description || "")
      .replace(/\r\n|\r|\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    // Trim benefits lines (bullets added in formatBenefits)
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

    // HEAD check
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
    const L = LAYOUTS[templateId] || LAYOUTS["zitko-1"];

    // video slot
    const overlayIdForLayer = cleanVideoId.replace(/\//g, ":");
    const videoSize = Math.min(L.video.w, L.video.h);
    const fetchB64 = toBase64Url(effectiveTemplateUrl);

    // This is your original, working transformation shape,
    // only with updated layout values above.
    const composedUrl = cloudinary.url(cleanVideoId, {
      resource_type: "video",
      type: "authenticated",
      sign_url: true,
      transformation: [
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // template PNG
        {
          raw_transformation: `l_fetch:${fetchB64}/c_fill,w_${CANVAS},h_${CANVAS}/fl_layer_apply,g_north_west,x_0,y_0`,
        },

        // video into slot
        {
          raw_transformation: `w_${videoSize},h_${videoSize},c_fill,r_max,l_video:authenticated:${overlayIdForLayer}`,
        },
        {
          raw_transformation: `fl_layer_apply,g_north_west,x_${L.video.x},y_${L.video.y}`,
        },

        // TITLE
        {
          overlay: {
            font_family: "Arial",
            font_size: L.title.fs,
            font_weight: L.title.bold ? "bold" : "normal",
            text: title,
            text_align: "left",
          },
          color: L.title.color,
          width: L.title.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: L.title.x,
          y: L.title.y,
          flags: "layer_apply",
        },

        // LOCATION
        {
          overlay: {
            font_family: "Arial",
            font_size: L.location.fs,
            font_weight: L.location.bold ? "bold" : "normal",
            text: location,
            text_align: "left",
          },
          color: L.location.color,
          width: L.location.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: L.location.x,
          y: L.location.y,
          flags: "layer_apply",
        },

        // SALARY
        {
          overlay: {
            font_family: "Arial",
            font_size: L.salary.fs,
            font_weight: L.salary.bold ? "bold" : "normal",
            text: salary,
            text_align: "left",
          },
          color: L.salary.color,
          width: L.salary.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: L.salary.x,
          y: L.salary.y,
          flags: "layer_apply",
        },

        // DESCRIPTION
        {
          overlay: {
            font_family: "Arial",
            font_size: L.description.fs,
            text: cleanDescription,
            text_align: "left",
          },
          color: L.description.color,
          width: L.description.w,
          height: L.description.h,
          crop: "fit",
          gravity: "north_west",
        },
        {
          gravity: "north_west",
          x: L.description.x,
          y: L.description.y,
          flags: "layer_apply",
        },

        // BENEFITS
        {
          overlay: {
            font_family: "Arial",
            font_size: L.benefits.fs,
            text: formatBenefits(cleanBenefits),
            text_align: "left",
            line_spacing: 6,
          },
          color: L.benefits.color,
          width: L.benefits.w,
          height: L.benefits.h,
          crop: "fit",
          gravity: "north_west",
        },
        {
          gravity: "north_west",
          x: L.benefits.x,
          y: L.benefits.y,
          flags: "layer_apply",
        },

        // EMAIL
        {
          overlay: {
            font_family: "Arial",
            font_size: L.email.fs,
            text: email,
            text_align: "left",
          },
          color: L.email.color,
          width: L.email.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: L.email.x,
          y: L.email.y,
          flags: "layer_apply",
        },

        // PHONE
        {
          overlay: {
            font_family: "Arial",
            font_size: L.phone.fs,
            text: phone,
            text_align: "left",
          },
          color: L.phone.color,
          width: L.phone.w,
          crop: "fit",
        },
        {
          gravity: "north_west",
          x: L.phone.x,
          y: L.phone.y,
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

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
  videoPublicId: string;                 // e.g. "job-posts/unassigned/eodhaf3p4unjjbv7wwbj"
  title?: string;
  location?: string;
  salary?: string;
  description?: string;
  templatePublicId?: string;             // e.g. "job-posts/templates/zitko-1"
};

function encodeText(t?: string) {
  if (!t) return "";
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
      templatePublicId = "job-posts/templates/zitko-1",
    } = (await req.json()) as Body;

    if (!videoPublicId) {
      return NextResponse.json({ error: "Missing videoPublicId" }, { status: 400 });
    }

    // If your template image is also authenticated, set type:'authenticated' in underlay too.
    const CANVAS = 1080;

    const composedUrl = cloudinary.url(videoPublicId, {
      resource_type: "video",
      type: "authenticated",          // IMPORTANT: your uploads show /video/authenticated/...
      sign_url: true,
      transformation: [
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // Template as UNDERLAY (assumes template is a public image in 'upload' type)
        {
          underlay: `image:${templatePublicId}`,
          width: CANVAS,
          height: CANVAS,
          crop: "fill",
        },

        // Circular video overlay (must also be authenticated)
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
          details: errText.slice(0, 2000), // pass Cloudinary message up to the client
          composedUrl,
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

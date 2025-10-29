// app/api/job/download-mp4/route.ts
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs"; // ensure Node (not Edge)

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

type Body = {
  // Cloudinary public_id of the uploaded video (no extension)
  videoPublicId: string;

  // dynamic text
  title?: string;
  location?: string;
  salary?: string;
  description?: string;

  // optional: choose a template public_id stored in Cloudinary
  templatePublicId?: string; // e.g. "job-posts/templates/zitko-1"
};

// utility to escape text for Cloudinary l_text
function encodeText(t?: string) {
  if (!t) return "";
  return encodeURIComponent(t).replace(/%2C/g, "%252C"); // commas must be double-encoded
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

    // Canvas size — match your template (screenshot looks square).
    const CANVAS = 1080;

    // Text styling (use a font you’ve enabled in Cloudinary; defaults are okay).
    const font = "Montserrat_700"; // or "Arial_700"
    const fontSmall = "Montserrat_600";

    // Positions (tweak to match your artwork)
    const titlePos = { x: 160, y: 160 };
    const locationPos = { x: 480, y: 250 };
    const salaryPos = { x: 480, y: 310 };
    const descPos = { x: 480, y: 380 };

    // Video circle position/size
    const videoSize = 360;
    const videoPos = { x: 60, y: 430 }; // top-left origin

    // Build a signed Cloudinary URL that:
    // 1) sets canvas to 1080x1080 (via resizing the base video)
    // 2) places your template as an UNDERLAY (so it sits behind everything)
    // 3) overlays the video as a circle at the desired spot
    // 4) overlays dynamic text
    // 5) returns mp4
    const composedUrl = cloudinary.url(videoPublicId, {
      resource_type: "video",
      sign_url: true,
      transformation: [
        // Make base video 1080x1080 so the canvas matches the template
        { width: CANVAS, height: CANVAS, crop: "fill" },

        // Put the template image BELOW (underlay) for the whole duration
        {
          underlay: `image:${templatePublicId}`,
          width: CANVAS,
          height: CANVAS,
          crop: "fill",
        },

        // Overlay the same (or trimmed) video as a circular thumbnail where you want it
        // This draws the video again as a small circle on top of the background
        {
          overlay: `video:${videoPublicId}`,
          transformation: [{ width: videoSize, height: videoSize, crop: "fill", radius: "max" }],
        },
        { gravity: "north_west", x: videoPos.x, y: videoPos.y, flags: "layer_apply" },

        // TITLE
        {
          overlay: {
            font_family: font,
            font_size: 56,
            text: encodeText(title),
          },
          color: "#ffffff",
        },
        { gravity: "north_west", x: titlePos.x, y: titlePos.y, flags: "layer_apply" },

        // LOCATION
        {
          overlay: {
            font_family: fontSmall,
            font_size: 36,
            text: encodeText(location),
          },
          color: "#cfd3d7",
        },
        { gravity: "north_west", x: locationPos.x, y: locationPos.y, flags: "layer_apply" },

        // SALARY
        {
          overlay: {
            font_family: fontSmall,
            font_size: 32,
            text: encodeText(salary),
          },
          color: "#cfd3d7",
        },
        { gravity: "north_west", x: salaryPos.x, y: salaryPos.y, flags: "layer_apply" },

        // DESCRIPTION (wrap long text using Cloudinary's built-in max_width)
        {
          overlay: {
            font_family: fontSmall,
            font_size: 28,
            text: encodeText(description),
          },
          color: "#ffffff",
          width: 520,
          crop: "fit",
        },
        { gravity: "north_west", x: descPos.x, y: descPos.y, flags: "layer_apply" },

        // Output
        { fetch_format: "mp4", quality: "auto" },
      ],
    });

    // Fetch the MP4 server-side and stream it back as a download.
    const videoRes = await fetch(composedUrl);
    if (!videoRes.ok) {
      const errText = await videoRes.text().catch(() => "");
      return NextResponse.json(
        { error: "Failed to compose video", details: errText.slice(0, 500) },
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

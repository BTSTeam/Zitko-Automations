// app/api/job/short-description/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

interface ReqBody {
  description?: string;
  model?: string;
  mode?: "default" | "tsi";
}

interface RespBody {
  description: string;
  benefits?: string;
}

// Pick model
function pickModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export async function POST(req: NextRequest) {
  const {
    description = "",
    model,
    mode = "default",
  } = (await req.json().catch(() => ({}))) as ReqBody;

  const apiKey = process.env.OPENAI_JOBPOST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_JOBPOST_API_KEY" },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------
  // 🔴 MODE = TSI (zitko-3, zitko-4)
  // -------------------------------------------------------------
  if (mode === "tsi") {
    const systemPrompt = `
You extract job responsibilities and benefits for a TSI social media job card.

Rules:
- Identify the TOP 3 responsibilities.
- Combine all benefits into ONE single bullet.
- Output ONLY bullet-pointed plain text. NO JSON. NO labels. NO extra text.

Format exactly like:
• First responsibility
• Second responsibility
• Third responsibility
• One-line combined benefits summary
`.trim();

    const userPrompt = `
Job description:
${String(description)}

Extract the responsibilities and benefits in bullet format ONLY.
`.trim();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || pickModel(),
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: "OpenAI TSI extraction failed", detail },
        { status: resp.status || 400 }
      );
    }

    const data = await resp.json().catch(() => ({}));
    const raw = (data?.choices?.[0]?.message?.content ?? "").trim();

    // raw is already bullet text — no JSON expected
    // Split to identify last bullet → benefits
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("•"));

    const responsibilities = lines.slice(0, 3).join("\n");
    const benefits = lines.slice(3).join("\n") || "";

    return NextResponse.json({
      description: responsibilities,
      benefits,
    });
  }

  // -------------------------------------------------------------
  // 🟧 MODE = DEFAULT (Zitko)
  // -------------------------------------------------------------
  const systemPrompt =
    "You craft concise, engaging summaries for job postings. "
    + "Your output must be a single plain-text sentence no longer than 196 characters. "
    + "Do not include the Job Title, Salary or any benefits.";

  const userPrompt = `Job description:\n\n${String(
    description
  )}\n\nSummarize the above in no more than 196 characters.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || pickModel(),
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 150,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return NextResponse.json(
      { error: "OpenAI summary failed", detail },
      { status: resp.status || 400 }
    );
  }

  const data = await resp.json().catch(() => ({}));
  let text: string = data?.choices?.[0]?.message?.content ?? "";

  text = text.replace(/\s+/g, " ").trim();
  if (text.length > 196) {
    text = text.slice(0, 196).trimEnd();
  }

  return NextResponse.json({
    description: text,
  });
}

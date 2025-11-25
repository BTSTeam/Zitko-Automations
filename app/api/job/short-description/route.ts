// app/api/job/short-description/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

interface ReqBody {
  description?: string;
  model?: string;
  mode?: "default" | "tsi";
}

interface RespBody {
  description: string;
  benefits?: string; // added for TSI runs
}

// Pick a default model
function pickModel() {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
}

export async function POST(req: NextRequest) {
  const {
    description = '',
    model,
    mode = "default",
  } = (await req.json().catch(() => ({}))) as ReqBody;

  const apiKey = process.env.OPENAI_JOBPOST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing OPENAI_JOBPOST_API_KEY' },
      { status: 500 }
    );
  }

  // -----------------------------------------------------
  // 🟥 MODE 1 — TSI templates (zitko-3 & zitko-4)
  // -----------------------------------------------------
  if (mode === "tsi") {
    const systemPrompt = `
      You extract structured job content for a TSI-branded job card.
      From the job description provided:
      - Identify the TOP 3 most important responsibilities.
      - Summarise all benefits into ONE single bullet.
      - Return ONLY JSON in the following schema:

      {
        "description": "• Responsibility 1\\n• Responsibility 2\\n• Responsibility 3",
        "benefits": "• One-line combined benefits summary"
      }
    `;

    const userPrompt = `Job description:\n\n${String(description)}`;

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
        { status: resp.status || 400 },
      );
    }

    const data = await resp.json().catch(() => ({}));
    let raw = data?.choices?.[0]?.message?.content ?? "";

    let parsed: RespBody = {
      description: "",
      benefits: "",
    };

    try {
      parsed = JSON.parse(raw);
    } catch {
      // fallback: if model didn't output JSON
      parsed = {
        description: raw.trim(),
        benefits: "",
      };
    }

    return NextResponse.json(parsed);
  }

  // -----------------------------------------------------
  // 🟧 MODE 2 — Normal Zitko templates (existing logic)
  // -----------------------------------------------------
  const systemPrompt =
    'You craft concise, engaging summaries for job postings. Your output must be a single plain-text sentence no longer than 196 characters. Do not include the Job Title, Salary or any benefits.';
  const userPrompt = `Job description:\n\n${String(
    description,
  )}\n\nSummarize the above in no more than 196 characters.`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || pickModel(),
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 150,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return NextResponse.json(
      { error: 'OpenAI summary failed', detail },
      { status: resp.status || 400 }
    );
  }

  const data = await resp.json().catch(() => ({}));
  let text: string = (data?.choices?.[0]?.message?.content ?? '') as string;

  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 196) {
    text = text.slice(0, 196).trimEnd();
  }

  const out: RespBody = { description: text };
  return NextResponse.json(out);
}

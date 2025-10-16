// app/api/job/summarize/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

type ReqBody = { description?: string; model?: string };
type RespBody = { title: string; location: string; salary: string; benefits: string[] };

// ensure we can parse JSON even if the model wraps it in prose/code fences
function ensureJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  return JSON.parse(text);
}

function pickModel() {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
}

export async function POST(req: NextRequest) {
  const { description = '', model } = (await req.json().catch(() => ({}))) as ReqBody;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
  }

  const systemPrompt =
    'You extract key fields from job descriptions. Return ONLY JSON with keys: "title" (string), "location" (string), "salary" (string), and "benefits" (array of up to 3 strings). Do not include company names or seniority fluff in the title. Provide the best 3 unique benefits/perks mentioned. If any field is missing, use empty strings or an empty array.';
  const userPrompt = `JOB DESCRIPTION:\n"""${String(description)}"""\nReturn JSON only.`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || pickModel(),
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return NextResponse.json({ error: 'OpenAI summarization failed', detail }, { status: resp.status || 400 });
  }

  const result = await resp.json();
  const content = result?.choices?.[0]?.message?.content ?? '{}';
  let parsed: any = {};
  try {
    parsed = ensureJson(content);
  } catch {}

  const out: RespBody = {
    title: String(parsed.title || '').trim(),
    location: String(parsed.location || '').trim(),
    salary: String(parsed.salary || '').trim(),
    benefits: Array.isArray(parsed.benefits) ? parsed.benefits.map((b: any) => String(b).trim()).filter(Boolean).slice(0, 3) : []
  };
  return NextResponse.json(out);
}

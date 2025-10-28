// app/api/job/short-description/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

interface ReqBody {
  description?: string;
  model?: string;
}

interface RespBody {
  description: string;
}

// Pick a reasonable default model. If the environment defines
// OPENAI_MODEL it will be used; otherwise we fall back to 'gpt-4o-mini'.
function pickModel() {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
}

/**
 * POST handler for the short description endpoint.
 * The request body must be JSON and may contain `description` and
 * optionally a `model` override. It calls the OpenAI Chat Completions
 * API with a system prompt instructing the model to produce a succinct
 * summary no longer than 196 characters. The response is trimmed to
 * ensure it does not exceed this limit.
 */
export async function POST(req: NextRequest) {
  const { description = '', model } = (await req.json().catch(() => ({}))) as ReqBody;
  const apiKey = process.env.OPENAI_JOBPOST_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OPENAI_JOBPOST_API_KEY' }, { status: 500 });
  }

  const systemPrompt =
    'You craft concise, engaging summaries for job postings. Your output must be a single plain-text sentence no longer than 196 characters. Do not included the Job Title, Salary or any benefits. ';
  const userPrompt = `Job description:\n\n${String(description)}\n\nSummarize the above in no more than 196 characters.`;

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
  // Collapse any whitespace and trim.
  text = text.replace(/\s+/g, ' ').trim();
  // Enforce the 196-character limit.
  if (text.length > 196) {
    text = text.slice(0, 196).trimEnd();
  }

  const out: RespBody = { description: text };
  return NextResponse.json(out);
}

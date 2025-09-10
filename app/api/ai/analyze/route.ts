// app/api/ai/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
  }

  // --- Parse request body safely ---
  let job: any = {};
  let candidates: any[] = [];
  try {
    const body = await req.json();
    job = body?.job ?? {};
    candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // If nothing to score, short-circuit
  const allowedIds = candidates
    .map((c: any) => String(c?.id ?? c?.candidate_id ?? ''))
    .filter(Boolean);

  if (allowedIds.length === 0) {
    return NextResponse.json({ ranked: [] }, { status: 200 });
  }

  // --- Prompts ---
  const system =
    'You are an expert recruitment consultant in the fire & security industry. Return only valid JSON with a "ranked" array.';

  const instruction = `
You are scoring candidates for a specific job on a 0–100 scale.

STRICT REQUIREMENTS:
- Score EVERY input candidate. Do NOT omit any. Do NOT add new candidates.
- Output EXACTLY one item per input candidate id (see ALLOWED_IDS below).
- Use the candidate id exactly as provided (string). No reformatting.
- Return only one JSON object with top-level key "ranked". No prose, markdown, or code fences.

SCORING RUBRIC (sums ≈100):
- Core hard skills/tooling: 40
- Formal qualifications/certifications: 30
- Current/last job title relevance: 20
- Other relevant keywords: 10

GUIDELINES:
- Reward close synonyms and minor spelling variants (e.g., "Milestone XProtect" ≈ "Milestone").
- Consider commute-friendly nearby cities acceptable unless explicitly disallowed by the job.
- Scale proportionally; don’t zero a candidate for one missing skill if others are strong.
- Title variations like "Senior Security Engineer" or "Security Systems Engineer" score well.
- If qualifications are missing but skills are strong, don’t drop below 40% solely for that reason.
- If candidate location exists, compare to job location explicitly in the reason (e.g., "Candidate in London; job in London").
- If at least one skill matches, cite at least one by name in the reason.
- Keep reasons concise and specific (≈30–40 words); avoid vague boilerplate.

ALLOWED_IDS: ${JSON.stringify(allowedIds)}

STRICT OUTPUT FORMAT:
{
  "ranked": [
    { "candidate_id": "<one of ALLOWED_IDS>", "score_percent": <number 0..100>, "reason": "<30–40 words>" }
  ]
}
  `.trim();

  const userPayload = {
    job: {
      title: job?.title ?? '',
      location: job?.location ?? '',
      skills: Array.isArray(job?.skills) ? job.skills : [],
      qualifications: Array.isArray(job?.qualifications) ? job.qualifications : [],
      description: job?.description ?? ''
    },
    candidates,              // pass through as-is for richer context
    allowed_ids: allowedIds, // also provide explicitly
    instruction              // echoed for the model to reference
  };

  // --- Call OpenAI ---
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      top_p: 1,
      seed: 42,
      presence_penalty: 0,
      frequency_penalty: 0,
      n: 1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) }
      ]
    })
  });

  const text = await r.text();

  // If the API itself errored, surface it (but try to parse ranked if possible)
  if (!r.ok) {
    // Try extracting any JSON error from OpenAI
    try {
      const maybeErr = JSON.parse(text);
      return NextResponse.json({ error: 'OpenAI error', detail: maybeErr }, { status: r.status });
    } catch {
      return NextResponse.json({ error: 'OpenAI error', detail: text }, { status: r.status });
    }
  }

  // --- Parse & reconcile model output ---
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Model returned non-JSON', raw: text },
      { status: 502 }
    );
  }

  const ranked = Array.isArray(parsed?.ranked) ? parsed.ranked : [];

  // Normalize, filter to allowed IDs, and coerce types
  const normalized = ranked
    .map((x: any) => ({
      candidate_id: String(x?.candidate_id ?? ''),
      score_percent: Number.isFinite(Number(x?.score_percent)) ? Number(x.score_percent) : 0,
      reason: String(x?.reason ?? '').trim()
    }))
    .filter((x: any) => allowedIds.includes(x.candidate_id));

  // Fill any missing candidates with zero-score placeholders (guarantee 1:1 with input)
  const byId = new Map<string, { candidate_id: string; score_percent: number; reason: string }>(
    normalized.map((x: any) => [x.candidate_id, x])
  );

  const complete = allowedIds.map((id) =>
    byId.get(id) ?? {
      candidate_id: id,
      score_percent: 0,
      reason:
        'Not scored by model; adding placeholder to ensure one entry per input candidate.'
    }
  );

  // Optional: sort high → low
  complete.sort((a, b) => b.score_percent - a.score_percent);

  // Helpful debug (visible in server logs)
  console.log(
    `[ai/analyze] received=${allowedIds.length} returned=${normalized.length} after_fill=${complete.length}`
  );

  return NextResponse.json({ ranked: complete }, { status: 200 });
}

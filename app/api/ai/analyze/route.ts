// app/api/ai/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }

  const { job, candidates, instruction } = await req.json()

  const system = `
instruction:
  `You are scoring candidates for a specific job on a 0–100 scale.

SCORING RUBRIC (sum to ~100):
- Core hard skills/tooling: 35
- Formal qualifications/certifications: 20
- Current/last job title relevance: 20
- Location proximity/commutability: 20
- Other relevant keywords: 5

GUIDELINES:
- Reward close synonyms (e.g., "Milestone XProtect" ≈ "Milestone").
- Treat commute-friendly nearby cities as acceptable unless the job explicitly requires on-site in a specific city.
- Do NOT zero a candidate for a single missing skill if the rest is strong—scale proportionally.
- Title variations like "Senior Security Engineer" or "Security Systems Engineer" should score well.
- If qualifications are missing but skills are strong, do not drop below 40% solely for that reason.

OUTPUT FORMAT:
Return JSON with key "ranked": an array of:
  { "candidate_id": string, "score_percent": number, "reason": string }

"reason" must cite specific matched skills/quals and any notable gaps (40 word response).`
`.trim()

  const user = JSON.stringify({
    job: {
      title: job?.title ?? '',
      location: job?.location ?? '',
      skills: job?.skills ?? [],
      qualifications: job?.qualifications ?? [],
      description: job?.description ?? ''
    },
    candidates: candidates ?? [],
    instruction: instruction ?? null
  })

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      // ↓↓↓ make outputs reproducible
      temperature: 0,
      top_p: 1,
      seed: 42,
      presence_penalty: 0,
      frequency_penalty: 0,
      n: 1,
      // ↑↑↑
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })

  const text = await r.text()
  return new NextResponse(text, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') || 'application/json'
    }
  })
}

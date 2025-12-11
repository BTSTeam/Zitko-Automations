// app/api/ai/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }

  const { job, candidates } = await req.json()

  /* ========================= SYSTEM ========================= */
  const system = `
You are an expert Fire & Security recruitment consultant. 
Your job is to evaluate candidates for a vacancy based on skills, professional qualifications, education, job title relevance, and training.

Return ONLY valid JSON with a top-level "ranked" array.
No markdown, no explanations — JSON ONLY.
`.trim()


  /* ========================= INSTRUCTIONS ========================= */
  const instruction = `
SCORING MODEL (sum ~100):
- Hard skills & tools: 35
- Professional qualifications/certifications: 20
- Education (degree, course, institution): 15
- Job title relevance: 10
- Training / short courses: 5
- Other relevant keywords: 5
- Employer DOES NOT affect the score but MUST be referenced in the reason when relevant.

STRICT OUTPUT:
- Output ONLY a JSON object with a single top-level key: "ranked".
- "ranked" MUST contain the SAME number of items as the input candidates array.
- Maintain EXACT input order. One output per candidate.
- Each item: { "candidate_id": string, "score_percent": number, "reason": string }

REASON STYLE (45–65 words, detailed):
- Reference: matched skills, missing skills, qualifications, education, training, job title relevance, and employer context.
- Mention employer only as context (“Currently at ADT Fire & Security, giving relevant exposure…”).
- No generic phrases like “lacks experience” — be specific.
- NO mention of location comparisons.
- NO markdown.

MATCHING RULES:
- Treat synonyms fairly (e.g., “Texecom Premier” ≈ “Texecom”).
- Minor spelling variations count as matches.
- Scale scores proportionally.
- Never return 0 unless absolutely no skills AND no quals AND no education AND irrelevant job title.
`.trim()


  /* ========================= USER PAYLOAD ========================= */
  const user = JSON.stringify({
    job: {
      title: job?.title ?? '',
      skills: job?.skills ?? [],
      qualifications: job?.qualifications ?? [],
      description: job?.description ?? ''
    },
    candidates: candidates ?? [],
    instruction
  })


  /* ========================= OPENAI REQUEST ========================= */
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      top_p: 1,
      seed: 42,
      presence_penalty: 0,
      frequency_penalty: 0,
      n: 1,
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

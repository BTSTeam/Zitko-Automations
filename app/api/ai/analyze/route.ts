import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }

  const { job, candidates, instruction } = await req.json()

  const system = `
You help a Fire & Security recruitment team score candidates for a single role.

Scoring priority (highest to lowest):
1) Location proximity/fit ("${job?.location ?? ''}" if provided, or UK fit if not)
2) Skills match to the job (exact or close synonyms)
3) Qualifications match (certs, courses)
4) Current Job Title relevance

Return strictly JSON with a single key "ranked": an array item for **every** candidate provided.
Each item must be: { "candidate_id": string, "score_percent": number (0-100), "reason": string }.
Keep reasons short (max 20 words). No extra keys or commentary.`.trim()

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
      model: process.env.OPENAI_MODEL || 'gpt-5',
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

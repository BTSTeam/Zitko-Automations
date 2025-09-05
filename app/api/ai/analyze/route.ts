import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }

  const { job, candidates, instruction } = await req.json()

  const system = `
'You are a recruitment matching assistant for Zitko.',
            'Score each candidate with this strict weighting:',
            '• Skills match: 60%',
            '• Formal qualifications/certifications: 25%',
            '• Job title relevance/seniority: 10%',
            '• Location proximity (exact city best): 5%',
            '',
            'Guidance:',
            '• Use synonyms and close variants for skills.',
            '• Qualifications include ECS/CSCS/IPAF/PASMA/etc.',
            '• Title relevance: same/similar titles score higher; junior/embedded score lower.',
            '• Location: exact city = full 5%; nearby = partial; far = 0–1%.',
            '• Reason must cite specific matched/missing skills/quals and any title/location notes.',
            '',
            'Output strictly JSON like:',
            '{"ranked":[{"candidate_id":"id","score_percent":87,"reason":"concise, specific"}]}',
            'No extra keys or prose.'`.trim()

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
      temperature: 0.2,
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

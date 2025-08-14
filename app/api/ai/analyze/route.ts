import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })

  const { job, candidates, instruction } = await req.json()

  const system = `You are an assistant helping a Fire & Security recruitment team. 
Score each candidate 0-100 for suitability to the job. 
Return JSON array with: candidate_id, score, reason (one sentence).`

  const user = JSON.stringify({ job, candidates, instruction })

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })

  const text = await r.text()
  return new NextResponse(text, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json' } })
}

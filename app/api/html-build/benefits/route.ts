// app/api/html-build/benefits/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 500 })
    }
    const { internal_description = '', public_description = '' } = await req.json()

    const prompt = [
      'Extract the TOP THREE distinct benefits from the following job descriptions.',
      'Return ONLY three short bullet lines (no numbering, no extra text).',
      '',
      'Internal Description:',
      internal_description,
      '',
      'Public Description:',
      public_description,
    ].join('\n')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: 'You extract concise benefit bullets from job descriptions.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 150,
        temperature: 0.2,
      }),
    })

    if (!res.ok) {
      const t = await res.text()
      return NextResponse.json({ error: `OpenAI error: ${res.status} ${t}` }, { status: 500 })
    }
    const data = await res.json()
    const content: string =
      data?.choices?.[0]?.message?.content ?? ''

    const lines = content
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean)
      .map((l: string) => l.replace(/^[-*•\d.\s]+/, '').trim())
      .slice(0, 3)

    return NextResponse.json({ benefits: lines })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

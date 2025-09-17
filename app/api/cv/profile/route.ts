// app/api/cv/profile/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_PROFILE_API_KEY!
const MODEL = process.env.OPENAI_PROFILE_MODEL || 'gpt-4o-mini'

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Missing OPENAI_PROFILE_API_KEY' }, { status: 500 })
  }

  try {
    const body = await req.json() as {
      mode: 'profile' | 'jobprofile'
      candidate: any
      work: any[]
      education: any[]
      job?: any
    }

    const { mode, candidate, work, education, job } = body

    const system = `You are an expert CV writer for the Fire & Security industry.
Return a professional, recruiter-ready "Profile" paragraph (5–8 concise sentences).
Avoid first-person pronouns and buzzword stuffing. Use UK spelling.`

    const messages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: `CANDIDATE JSON:\n${JSON.stringify({ candidate, work, education })}` },
      ...(mode === 'jobprofile' && job ? [
        { role: 'user' as const, content: `JOB JSON:\n${JSON.stringify(job)}` },
        { role: 'user' as const, content: `TASK: Create a professional CV Profile tailored to the job.` },
      ] : [
        { role: 'user' as const, content: `TASK: Create a professional CV Profile summarising the candidate.` },
      ]),
    ]

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages,
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      return NextResponse.json({ ok: false, error: `OpenAI error: ${err}` }, { status: 502 })
    }

    const json = await resp.json()
    const profile = json?.choices?.[0]?.message?.content?.trim() || ''

    return NextResponse.json({ ok: true, profile })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed to generate profile' }, { status: 500 })
  }
}

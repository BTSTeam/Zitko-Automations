// app/api/ai/analyze/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

type JobIn = {
  title?: string
  location?: string
  skills?: string[]
  qualifications?: string[]
  description?: string
}

type CandIn = {
  candidate_id: string
  full_name?: string
  location?: string
  current_job_title?: string
  skills?: string[]
  qualifications?: string[]
  linkedin?: string | null
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function sysPrompt() {
  return [
    `You are an expert recruiter. Score each candidate’s suitability for the job as a PERCENT from 0–100.`,
    `Consider (in order): location fit, demonstrated skills, relevant qualifications, and current job title.`,
    `Be strict but fair. 100% is extremely rare. 0% means clearly unsuitable.`,
    `Return STRICT JSON with this shape ONLY:`,
    `{"ranked":[{"candidate_id":"<id>","score_percent":0-100,"reason":"<1-3 short sentences>"}]}`,
    `Do NOT include any keys other than "ranked". No markdown.`,
  ].join('\n')
}

async function callOpenAI(job: JobIn, cands: CandIn[]) {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')

  const userContent = JSON.stringify({
    job: {
      title: job.title ?? '',
      location: job.location ?? '',
      skills: job.skills ?? [],
      qualifications: job.qualifications ?? [],
      description: job.description ?? '',
    },
    candidates: cands.map(c => ({
      candidate_id: c.candidate_id,
      full_name: c.full_name ?? '',
      location: c.location ?? '',
      current_job_title: c.current_job_title ?? '',
      skills: c.skills ?? [],
      qualifications: c.qualifications ?? [],
      linkedin: c.linkedin ?? null,
    })),
  })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sysPrompt() },
        { role: 'user', content: userContent },
      ],
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${JSON.stringify(json)}`)
  }
  const content = json?.choices?.[0]?.message?.content || '{}'
  let parsed: any = {}
  try { parsed = JSON.parse(content) } catch { parsed = {} }
  const ranked = Array.isArray(parsed?.ranked) ? parsed.ranked : []
  return ranked as { candidate_id: string, score_percent: number, reason: string }[]
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const job: JobIn = body?.job ?? {}
    const candidates: CandIn[] = Array.isArray(body?.candidates) ? body.candidates : []

    const batches = chunk(candidates, 20)
    const all: { candidate_id: string, score_percent: number, reason: string }[] = []

    for (const batch of batches) {
      try {
        const ranked = await callOpenAI(job, batch)
        all.push(...ranked)
      } catch {
        const ranked = await callOpenAI(job, batch) // one retry
        all.push(...ranked)
      }
    }

    const byId = new Map<string, { candidate_id: string, score_percent: number, reason: string }>()
    for (const r of all) byId.set(String(r.candidate_id), {
      candidate_id: String(r.candidate_id),
      score_percent: Math.max(0, Math.min(100, Math.round(Number(r.score_percent) || 0))),
      reason: String(r.reason || '').slice(0, 600),
    })

    const ranked = Array.from(byId.values())
    return NextResponse.json({ ranked })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI analysis failed' }, { status: 500 })
  }
}

// app/api/ai/analyze/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Job = {
  title?: string
  location?: string
  skills?: string[]
  qualifications?: string[]
  description?: string
}

type Candidate = {
  candidate_id: string | number
  full_name?: string
  location?: string
  current_job_title?: string
  skills?: string[]
  qualifications?: string[]
  keywords?: string[]
}

function cleanArr(a?: string[]) {
  return Array.isArray(a) ? a.map(s => String(s).trim()).filter(Boolean) : []
}

async function callOpenAI(payload: any) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // Many current OpenAI models support structured JSON responses:
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
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
            '• Location: exact city = full 5%; nearby area = partial; far away = 0–1%.',
            '• Produce a short, specific reason citing matched/missing skills/quals and any title/location notes.',
            '',
            'Output strictly JSON with this shape:',
            '{"ranked":[{"candidate_id":"id","score_percent":87,"reason":"one or two concise sentences"}]}',
            'Do not include any extra keys or text outside JSON.'
          ].join('\n')
        },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    })
  })

  // Don’t throw on non-200; we’ll degrade gracefully
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    // Direct JSON
    if (Array.isArray(json?.ranked)) return json
    // Wrapped JSON (choices[0].message.content)
    const content = json?.choices?.[0]?.message?.content
    if (typeof content === 'string') {
      try { return JSON.parse(content) } catch {}
    }
  } catch { /* noop */ }
  return { ranked: [] }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const job: Job = body?.job || {}
    const candidates: Candidate[] = Array.isArray(body?.candidates) ? body.candidates : []
    const extraInstruction: string = body?.instruction || ''

    const jobPayload: Job = {
      title: String(job.title || '').trim(),
      location: String(job.location || '').trim(),
      skills: cleanArr(job.skills),
      qualifications: cleanArr(job.qualifications),
      description: String(job.description || '').trim(),
    }

    // Chunk to be safe on tokens
    const chunkSize = 40
    const allRanked: any[] = []

    for (let i = 0; i < candidates.length; i += chunkSize) {
      const slice = candidates.slice(i, i + chunkSize)
      const userPayload = {
        job: jobPayload,
        candidates: slice.map(c => ({
          candidate_id: String(c.candidate_id ?? c),
          full_name: c.full_name || '',
          location: c.location || '',
          current_job_title: c.current_job_title || '',
          skills: cleanArr(c.skills),
          qualifications: cleanArr(c.qualifications),
          keywords: cleanArr(c.keywords),
        })),
        instruction: extraInstruction
      }

      const out = await callOpenAI(userPayload)
      const ranked = Array.isArray(out?.ranked) ? out.ranked : []
      allRanked.push(...ranked)
    }

    return NextResponse.json({ ranked: allRanked })
  } catch (err: any) {
    console.error('AI analyze error:', err?.message || err)
    return NextResponse.json({ ranked: [], error: 'analyze_failed' }, { status: 200 })
  }
}

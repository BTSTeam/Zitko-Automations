// app/api/ai/analyze/route.ts
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const job: Job = body?.job || {}
    const candidates: Candidate[] = Array.isArray(body?.candidates) ? body.candidates : []
    const extraInstruction: string = body?.instruction || ''

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    // Normalise job fields
    const jobPayload: Job = {
      title: String(job.title || '').trim(),
      location: String(job.location || '').trim(),
      skills: cleanArr(job.skills),
      qualifications: cleanArr(job.qualifications),
      description: String(job.description || '').trim(),
    }

    // Chunk to stay comfortably within token limits
    const chunkSize = 40
    const allRanked: any[] = []

    for (let i = 0; i < candidates.length; i += chunkSize) {
      const slice = candidates.slice(i, i + chunkSize)

      const system = [
        'You are a recruitment matching assistant for Zitko.',
        'Score each candidate for this job with this strict weighting:',
        '• Skills match: 60%',
        '• Formal qualifications/certifications: 25%',
        '• Job title relevance/seniority: 10%',
        '• Location proximity (exact city best): 5%',
        '',
        'Guidance:',
        '• Use synonyms and close variants for skills.',
        '• Qualifications include ECS/CSCS/IPAF/PASMA/etc.',
        '• Title relevance: same/similar titles score higher; junior/embedded if less relevant score lower.',
        '• Location: exact city = full 5%; nearby area = partial; far away = 0–1%.',
        '• Produce a short, specific reason citing matched/missing skills/quals and any title/location notes.',
        '',
        'Output strictly JSON with this shape:',
        '{"ranked":[{"candidate_id":"id","score_percent":87,"reason":"one or two concise sentences"}]}',
        'Do not include any extra keys or text outside JSON.',
      ].join('\n')

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

      const completion = await client.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' }, // forces JSON if supported
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(userPayload) }
        ]
      })

      const text = completion.choices?.[0]?.message?.content || '{}'
      let parsed: any = {}
      try { parsed = JSON.parse(text) } catch { parsed = {} }
      const ranked = Array.isArray(parsed?.ranked) ? parsed.ranked : []
      allRanked.push(...ranked)
    }

    // Return the combined ranked list
    return NextResponse.json({ ranked: allRanked })
  } catch (err: any) {
    console.error('AI analyze error:', err?.message || err)
    return NextResponse.json({ ranked: [], error: 'analyze_failed' }, { status: 200 })
  }
}

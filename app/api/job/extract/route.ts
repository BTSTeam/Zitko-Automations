// app/api/job/extract/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

type ExtractReq = {
  publicDescription?: string
  internalDescription?: string
  model?: string
}

type ExtractResp = {
  title: string
  location: string
  skills: string[]
  qualifications: string[]
}

function pickModel() {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
}

function ensureJson(text: string): any {
  // Try to extract the first {...} block if the model adds prose/code fences
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1)
    return JSON.parse(slice)
  }
  return JSON.parse(text)
}

export async function POST(req: NextRequest) {
  const { publicDescription = '', internalDescription = '', model } = (await req.json().catch(() => ({}))) as ExtractReq

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }

  const joined = [publicDescription, internalDescription].filter(Boolean).join('\n\n---\n\n')

  const sys = `You extract clean, structured data from job descriptions for recruitment search.
Return ONLY JSON with keys: "title" (string), "location" (string), "skills" (array of strings), "qualifications" (array of strings).
Rules:
- Make "title" concise (no company, no seniority fluff unless essential).
- Make "location" human-readable (e.g., "London, UK" or closest you can infer).
- "skills" should be deduplicated and normalized (e.g., "JavaScript", "React", "CCTV", "Access Control").
- "qualifications" are degrees/certifications/tickets (e.g., "Degree in Electrical Engineering", "CSCS", "Prince2").
- If something is unknown, use empty string or empty array.
No extra commentary.`

  const usr = `JOB TEXT BELOW
"""
${joined}
"""

Return JSON only.`

  // Chat Completions (compatible with your existing approach)
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || pickModel(),
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: usr },
      ],
    }),
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    return NextResponse.json({ error: 'OpenAI extract failed', detail }, { status: 400 })
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content ?? '{}'

  let parsed: ExtractResp
  try {
    parsed = ensureJson(content)
  } catch {
    parsed = { title: '', location: '', skills: [], qualifications: [] }
  }

  // Final sanitization
  const title = String(parsed.title || '').trim()
  const location = String(parsed.location || '').trim()
  const skills = Array.isArray(parsed.skills) ? parsed.skills.map(s => String(s).trim()).filter(Boolean) : []
  const qualifications = Array.isArray(parsed.qualifications) ? parsed.qualifications.map(q => String(q).trim()).filter(Boolean) : []

  return NextResponse.json({ title, location, skills, qualifications })
}

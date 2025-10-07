// app/api/job/extract/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

type ExtractReq = {
  publicDescription?: string
  internalDescription?: string
  keywords?: string[]
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
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      /* ignore */
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return { title: '', location: '', skills: [], qualifications: [] }
  }
}

export async function POST(req: NextRequest) {
  const { publicDescription = '', internalDescription = '', keywords = [], model } =
    (await req.json().catch(() => ({}))) as ExtractReq

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }

  const joined = [
    publicDescription,
    internalDescription,
    keywords.length ? `Keywords: ${keywords.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n---\n\n')

  const sys = `You extract structured data from job postings for recruitment search.
Return ONLY valid JSON with these keys: "title", "location", "skills", "qualifications".
Rules:
- "title": concise and standardized (no company name or fluff).
- "location": readable city + country, e.g. "London, UK".
- "skills": list of deduplicated, core technical or role-relevant terms (normalize case, remove duplicates).
- "qualifications": list of degrees, certifications, or tickets.
- If unsure, use empty string or empty array.
No explanations, no commentary — JSON only.`

  const usr = `JOB DATA BELOW
"""
${joined}
"""

Return JSON only.`

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
  const parsed = ensureJson(content)

  const title = String(parsed.title || '').trim()
  const location = String(parsed.location || '').trim()
  const skills = Array.isArray(parsed.skills)
    ? parsed.skills.map((s) => String(s).trim()).filter(Boolean)
    : []
  const qualifications = Array.isArray(parsed.qualifications)
    ? parsed.qualifications.map((q) => String(q).trim()).filter(Boolean)
    : []

  return NextResponse.json({ title, location, skills, qualifications })
}

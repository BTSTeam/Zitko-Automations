import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ContentRequest = {
  region?: string | null
  audience?: string | null
  topics?: string[]
  customTopic?: string
  tone?: string | null
  postType?: string | null
  contentLength?: string | null
  addOpeningHook?: boolean
  addEndingHook?: boolean
  keepShort?: boolean
  fiveDays?: boolean
  platforms?: string[]
  preferVisualIdeasOnly?: boolean
}

function buildPrompt(body: ContentRequest): string {
  const {
    region,
    audience,
    topics = [],
    customTopic,
    tone,
    postType,
    contentLength,
    addOpeningHook,
    addEndingHook,
    keepShort,
    fiveDays,
    platforms = [],
    preferVisualIdeasOnly,
  } = body

  const hasTikTokOrInsta = platforms.some(
    (p) => p.toLowerCase() === 'tiktok' || p.toLowerCase() === 'instagram',
  )

  return [
    'You are an expert social media creator for a recruitment agency that hires into the electronic Security and fire & life safety industry (alarms, CCTV, access control, fire systems – not physical guarding or manned security). You speak as a recruitment consultant, not as a security engineer.',
    region ? `Region: ${region}.` : '',
    audience ? `Audience: ${audience}.` : '',
    topics.length || customTopic
      ? `Topic / focus: ${[...topics, customTopic].filter(Boolean).join(' | ')}.`
      : '',
    tone
      ? `Tone: ${tone}.`
      : '',
    postType ? `Post type: ${postType}.` : '',
    contentLength === 'Short'
      ? 'Keep content very short and punchy.'
      : contentLength === 'Long'
      ? 'Allow slightly longer but still scannable content.'
      : keepShort
      ? 'Keep content concise.'
      : '',
    fiveDays
      ? 'Generate 5 posts labelled Day 1 to Day 5.'
      : 'Generate 2 clearly different options.',
    preferVisualIdeasOnly
      ? 'Describe visual or short-form video ideas only.'
      : 'Write finished, social-media-ready copy.',
    hasTikTokOrInsta
      ? 'Use natural, conversational language suitable for short-form video. Avoid clichés.'
      : 'Professional but human tone suitable for LinkedIn.',
    'Avoid corporate clichés. Return only the final content.',
  ]
    .filter(Boolean)
    .join(' ')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.CONTENT_CREATION_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CONTENT_CREATION_API_KEY is not configured.' },
      { status: 500 },
    )
  }

  const body = (await req.json()) as ContentRequest
  const prompt = buildPrompt(body)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You always speak as a recruiter who hires for the Security industry, not as an engineer.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 900,
    }),
  })

  const data = await response.json()
  const content =
    data?.choices?.[0]?.message?.content?.trim() || 'No content generated.'

  return NextResponse.json({ content })
}

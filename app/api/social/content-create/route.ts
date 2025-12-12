// app/api/social/content-create/route.ts
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

  const regionPart = region ? `Region: ${region}.` : ''
  const audiencePart = audience ? `Audience: ${audience}.` : ''

  const topicsList = topics.length ? topics.join(', ') : ''
  const effectiveTopic = [
    topicsList,
    customTopic && customTopic.trim().length ? customTopic.trim() : '',
  ]
    .filter(Boolean)
    .join(' | ')

  const topicPart = effectiveTopic
    ? `Topic / focus: ${effectiveTopic}.`
    : 'Topic / focus: general electronic Security systems and fire & life safety recruitment (no physical guarding or manned security), hiring and careers.'

  const tonePart = tone
    ? `Tone: ${tone} (clear, confident, on-brand for an electronic Security recruitment company).`
    : 'Tone: clear, confident, on-brand for an electronic Security recruitment company.'

  const postTypePart = postType ? `Post type: ${postType.toLowerCase()} style.` : ''

  const platformList = platforms.length ? platforms.join(', ') : ''
  const platformPart = platformList ? `Platforms: ${platformList}.` : ''

  const hasTikTokOrInsta = platforms.some(
    (p) => p.toLowerCase() === 'tiktok' || p.toLowerCase() === 'instagram',
  )

  const humanStylePart = hasTikTokOrInsta
    ? `Write like a real recruiter or consultant speaking on camera: natural, conversational language, use contractions (you're, we're, can't), vary sentence length and rhythm, and a light emoji now and then if it genuinely fits. Avoid buzzwords and corporate clichés.`
    : `Write like a real Security recruiter posting on LinkedIn: professional but human, use contractions (you're, we're, can't), vary sentence length, avoid buzzwords and corporate clichés, and don't overuse emojis or hashtags.`

  const hookParts: string[] = []
  if (addOpeningHook) {
    hookParts.push(
      'Start with a strong 1-sentence hook to grab attention in the first line.',
    )
  }
  if (addEndingHook) {
    hookParts.push(
      'End with a simple call-to-action or question that encourages engagement.',
    )
  }

  let lengthPart: string
  if (contentLength === 'Short') {
    lengthPart =
      'Keep each post very short and punchy (1–2 short sentences, ideal for fast scroll).'
  } else if (contentLength === 'Medium') {
    lengthPart =
      'Keep each post medium length (around 3–6 short sentences, or 1–2 short paragraphs).'
  } else if (contentLength === 'Long') {
    lengthPart =
      'Allow slightly longer content (up to 3 short paragraphs) while staying highly scannable and social-friendly.'
  } else {
    lengthPart = keepShort
      ? 'Keep each post punchy and concise (1–3 short sentences).'
      : 'You can use 2–4 short paragraphs if helpful, but still keep it social-media friendly.'
  }

  const daysPart = fiveDays
    ? 'Generate 5 different posts (label them Day 1 to Day 5). Each post should be unique but consistent with the topic and audience.'
    : 'Generate 1 high-quality post.'

  // Generic visual-ideas instruction
  const baseStyleForVisual =
    'Focus on describing short-form video or visual POST IDEAS (for TikTok / Instagram Reels, etc.), not long written captions. For each idea, describe the visual hook and what happens on screen.'

  // When TikTok / Instagram are selected, lean into viral/trending formats
  const viralAngle = hasTikTokOrInsta
    ? 'Base ideas on widely popular or evergreen viral formats (for example: quick cuts, before/after, POV, skits, “day in the life”, text-on-screen memes, simple challenges, green-screen explainers). These ideas do not have to be Security-specific – they can be funny, relatable or lifestyle content that a recruiter or consultant might realistically post. Do not mention specific copyrighted songs, sounds or creators – describe only the concept and structure.'
    : ''

  const styleInstruction = preferVisualIdeasOnly
    ? `${baseStyleForVisual} ${viralAngle}`.trim()
    : 'Write finished social-media-ready copy suitable for the chosen platforms (assume LinkedIn if none are given). Focus on Security (electronic systems, alarms, CCTV, access control, fire & life safety), not physical guarding or manned security.'

  const noClichePart =
    'Avoid generic phrases like "in today’s fast-paced world", "leveraging synergies", "cutting-edge solutions", or anything that sounds like generic corporate marketing. Make it sound like a real person in the Security recruitment market talking to their own network.'

  const formatPart =
    'Return only the finished content (or list of ideas), no explanations and no markdown formatting.'

  return [
    'You are an expert social media creator for an electronic Security (alarms, CCTV, access control, fire & life safety – not physical guarding or manned security) recruitment agency.',
    regionPart,
    audiencePart,
    platformPart,
    topicPart,
    tonePart,
    postTypePart,
    humanStylePart,
    hookParts.join(' '),
    lengthPart,
    daysPart,
    styleInstruction,
    noClichePart,
    formatPart,
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

  let body: ContentRequest
  try {
    body = (await req.json()) as ContentRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const prompt = buildPrompt(body)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert Security (electronic systems, alarms, CCTV, access control, fire & life safety – not physical guarding) recruitment marketer who writes short-form social content.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.85,
        max_tokens: 700,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json(
        { error: 'OpenAI error', detail: text },
        { status: 500 },
      )
    }

    const data = await response.json()
    const content =
      data?.choices?.[0]?.message?.content?.trim() || 'No content generated.'

    return NextResponse.json({ content })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to generate content.', detail: err?.message },
      { status: 500 },
    )
  }
}

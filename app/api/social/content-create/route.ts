// app/api/social/content-create/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ContentRequest = {
  region?: string | null
  perspective?: string | null
  topics?: string[]
  customTopic?: string
  audience?: string | null
  tone?: string | null
  postType?: string | null
  platform?: string | null
  contentLength?: string | null
  callToAction?: boolean
}

function buildPrompt(body: ContentRequest): string {
  const {
    region,
    perspective,
    topics = [],
    customTopic,
    audience,
    tone,
    postType,
    platform,
    contentLength,
    callToAction,
  } = body

  const isPoll = (postType || '').toLowerCase() === 'poll'
  const isViralTopic = topics.includes('Viral trend commentary')

  const platformLower = (platform || '').toLowerCase()
  const isTikTokOrInstagram = platformLower === 'tiktok' || platformLower === 'instagram'

  const regionPart = region ? `Region: ${region}.` : ''
  const audiencePart = audience ? `Audience: ${audience}.` : ''
  const tonePart = tone ? `Tone: ${tone}.` : 'Tone: Conversational.'
  const platformPart = platform ? `Platform: ${platform}.` : ''
  const postTypePart = postType ? `Post format: ${postType}.` : ''

  const lengthPart =
    contentLength?.toLowerCase() === 'short'
      ? 'Content length: Short. Keep each option tight and punchy.'
      : contentLength?.toLowerCase() === 'long'
      ? 'Content length: Long. Give more detail while staying readable.'
      : 'Content length: Medium. Enough detail without being wordy.'

  const effectiveTopic = [topics.length ? topics.join(', ') : '', customTopic?.trim() ? customTopic.trim() : '']
    .filter(Boolean)
    .join(' | ')
  const topicPart = effectiveTopic ? `Theme / focus: ${effectiveTopic}.` : ''

  const perspectivePart = perspective
    ? `Perspective: write in a ${perspective.toLowerCase()} voice (natural, not exaggerated).`
    : ''

  // Spelling rules
  const useUSSpelling = (region || '').toLowerCase() === 'usa'
  const spellingPart = useUSSpelling
    ? 'Spelling: Use US English spelling (e.g., specialize, organization, color, center).'
    : 'Spelling: Use UK English spelling (e.g., specialise, organisation, colour, centre).'

  const hardRules = [
    'ABSOLUTE RULES:',
    '1) NEVER use extended dashes (— or –). Do not output them. Use a standard hyphen (-) only if needed.',
    '2) NEVER mention "life safety" or "life-safety" or "life safety industry". We do not operate in life safety.',
    '3) We are a Fire & Security recruitment business. Heavier focus on the SECURITY sector (electronic security systems).',
    '4) Security scope = intruder alarms, CCTV, access control, and related electronic security roles. Fire scope = fire alarm / fire systems roles only.',
    '5) EXCLUDE physical guarding / manned security / door supervision.',
    '6) Speak as a recruitment consultant who hires for the industry, not as an engineer/installer.',
    '7) Return content only. No markdown. No explanations.',
  ].join(' ')

  // Hook ALWAYS required
  const alwaysHookRule = [
    'HOOK REQUIREMENT:',
    'Start EACH option with a 3-second stop-scrolling hook.',
    'The hook must be the very first line.',
    'Keep the hook to one punchy line (max 12 words).',
  ].join(' ')

  // Call to action (engagement) – optional
  const ctaRule = callToAction
    ? [
        'CALL TO ACTION REQUIREMENT:',
        'End each option with a clear call to action to drive engagement (comments, DMs, votes, saves).',
        audience
          ? `Tailor the call to action for the selected audience (${audience}).`
          : 'If audience is not selected, make the call to action work for both candidates and clients.',
      ].join(' ')
    : 'Do not add a forced call to action at the end.'

  // Always 2 ideas
  const twoIdeasRule = isPoll
    ? 'Generate 2 different poll options. Label them Option 1 and Option 2.'
    : postType?.toLowerCase().includes('full week')
    ? 'Generate 2 different full week plans. Label them Option 1 and Option 2. Each option must include Day 1 to Day 5.'
    : 'Generate 2 different content options. Label them Option 1 and Option 2.'

  // Poll rules
  const pollRules = isPoll
    ? [
        'POLL REQUIREMENTS (apply to EACH option):',
        'Provide ONE clear question.',
        'Provide at least 4 answer options.',
        'One option MUST be: "Other (comment below)".',
        'End by encouraging people to comment what they chose and why (still follow CTA setting).',
      ].join(' ')
    : ''

  // Platform-specific behaviour
  const platformRules = isTikTokOrInstagram
    ? [
        'PLATFORM REQUIREMENTS:',
        'This is for TikTok/Instagram.',
        'Base the idea on broadly viral formats at the moment (or likely to go viral).',
        'It does NOT need to be security-industry-led. Do not force security references.',
        'Do not name specific copyrighted sounds, creators, or claim exact stats.',
        'Describe the trend format conceptually (POV, quick cuts, green-screen reaction, meme caption format, etc.).',
        'Still write as a recruitment consultant posting to your network.',
      ].join(' ')
    : platform
    ? [
        'PLATFORM REQUIREMENTS:',
        `Optimise for ${platform}.`,
        'If LinkedIn/Facebook, keep it relevant to hiring and the Fire & Security market (but still avoid clichés).',
      ].join(' ')
    : ''

  // Viral topic rules (works alongside platform rules)
  const viralTopicRules = isViralTopic
    ? [
        'VIRAL TREND REQUIREMENTS:',
        'Base the idea on formats that are trending across major social platforms.',
        'Do not name specific copyrighted sounds, creators, or make up exact stats.',
        'Describe the trend format conceptually and write as if it is currently popular.',
      ].join(' ')
    : ''

  const audienceFallback = audience ? '' : 'Assume the post can appeal to both candidates and clients.'
  const toneFallback = tone ? '' : 'Keep it human and recruiter-to-network, not corporate marketing.'

  return [
    'You write social content for a Fire & Security recruitment agency.',
    hardRules,
    spellingPart,
    regionPart,
    platformPart,
    audiencePart,
    postTypePart,
    perspectivePart,
    topicPart,
    lengthPart,
    audienceFallback,
    tonePart,
    toneFallback,
    platformRules,
    alwaysHookRule,
    ctaRule,
    twoIdeasRule,
    pollRules,
    viralTopicRules,
    'Avoid corporate clichés and buzzwords. Keep it clear, confident, and natural.',
  ]
    .filter(Boolean)
    .join(' ')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.CONTENT_CREATION_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'CONTENT_CREATION_API_KEY is not configured.' }, { status: 500 })
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
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a Fire & Security recruitment consultant. You never mention "life safety". You never use extended dashes (— or –). You follow regional spelling rules.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.85,
        max_tokens: 900,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json({ error: 'OpenAI error', detail: text }, { status: 500 })
    }

    const data = await response.json()
    let content: string = data?.choices?.[0]?.message?.content?.trim() || 'No content generated.'

    // Hard guarantee: remove extended dashes if they appear
    content = content.replace(/[—–]/g, '-')

    // Hard guarantee: remove banned phrase if it ever appears
    content = content.replace(/life\s*safety/gi, 'fire & security')

    return NextResponse.json({ content })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to generate content.', detail: err?.message }, { status: 500 })
  }
}

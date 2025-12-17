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
  includeHook?: boolean
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
    includeHook,
    platform,
    contentLength,
    callToAction,
  } = body

  const isPoll = (postType || '').toLowerCase() === 'poll'
  const isViral = topics.includes('Viral Trend')

  const regionPart = region ? `Region: ${region}.` : ''
  const audiencePart = audience ? `Audience: ${audience}.` : ''
  const tonePart = tone ? `Tone: ${tone}.` : 'Tone: Conversational.'
  const postTypePart = postType ? `Post format: ${postType}.` : ''
  const platformPart = platform ? `Platform: ${platform}.` : ''
  const lengthPart = contentLength ? `Content length: ${contentLength}.` : ''

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

  // HARD rules to stop unwanted wording
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

  // Hook behaviour
  const hookRule = includeHook
    ? [
        'Include an opening hook.',
        audience
          ? 'Base the hook on the selected audience.'
          : 'No audience selected - write hooks that work for BOTH candidates and clients.',
      ].join(' ')
    : 'Do not force a hook unless it naturally fits.'

  const ctaRule = callToAction
    ? [
        'Include a clear call to action designed to increase engagement.',
        audience
          ? 'Match the call to action to the selected audience.'
          : 'If no audience selected, use a call to action that works for both candidates and clients.',
      ].join(' ')
    : 'Do not force a call to action unless it naturally fits.'

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
        'The poll question MUST be a maximum of 140 characters.',
        'Provide at least 4 answer options.',
        'Each answer option MUST be a maximum of 30 characters.',
        'One option MUST be: "Other (comment below)".',
        'End by encouraging people to comment what they chose and why.',
      ].join(' ')
    : ''

  // Viral rules (no claims of live data, but framed as current)
  const viralRules = isViral
    ? [
        'VIRAL TREND REQUIREMENTS:',
        'Base the idea on formats that are currently trending across major social platforms.',
        'Do not name specific copyrighted sounds, creators, or make up exact stats.',
        'Describe the trend format conceptually (POV, quick cuts, green-screen reaction, meme caption format, etc.) and write as if it is currently popular.',
      ].join(' ')
    : ''

  const audienceFallback = audience ? '' : 'Assume the post can appeal to both candidates and clients.'
  const toneFallback = tone ? '' : 'Keep it human and recruiter-to-network, not corporate marketing.'

  return [
    'You write social content for a Fire & Security recruitment agency.',
    hardRules,
    spellingPart,
    regionPart,
    audiencePart,
    postTypePart,
    platformPart,
    lengthPart,
    perspectivePart,
    topicPart,
    audienceFallback,
    tonePart,
    toneFallback,
    hookRule,
    ctaRule,
    twoIdeasRule,
    pollRules,
    viralRules,
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

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
  } = body

  const isPoll = (postType || '').toLowerCase() === 'poll'
  const isViral = topics.includes('Viral trend commentary')

  const regionPart = region ? `Region: ${region}.` : ''
  const audiencePart = audience ? `Audience: ${audience}.` : ''
  const tonePart = tone ? `Tone: ${tone}.` : 'Tone: Conversational.'
  const postTypePart = postType ? `Post type: ${postType}.` : ''

  const topicsList = topics.length ? topics.join(', ') : ''
  const effectiveTopic = [topicsList, customTopic?.trim() ? customTopic.trim() : '']
    .filter(Boolean)
    .join(' | ')

  const topicPart = effectiveTopic
    ? `Topic / focus: ${effectiveTopic}.`
    : 'Topic / focus: recruitment into the electronic Security and fire & life safety industry (alarms, CCTV, access control, fire systems - not physical guarding or manned security).'

  const perspectivePart = perspective
    ? `Perspective: write in a ${perspective.toLowerCase()} voice (natural, human, not exaggerated).`
    : ''

  const hardRules = [
    'ABSOLUTE RULES:',
    '1) NEVER use extended dashes (— or –). Do not output them. Use a standard hyphen (-) only if needed.',
    '2) Do not produce text like "equal—and". If you must connect words, use "equal-and".',
    '3) Speak as a recruitment consultant who hires for the industry, not as an engineer/installer.',
    '4) No markdown, no bullet styling that relies on extended dashes.',
  ].join(' ')

  const hookRule = includeHook
    ? [
        'Include an opening hook.',
        audience
          ? 'Base the hook on the selected audience.'
          : 'No audience was selected - create a hook that works for BOTH candidates and clients.',
      ].join(' ')
    : 'Do not force an opening hook unless it naturally fits.'

  const pollRules = isPoll
    ? [
        'This is a POLL format.',
        'Provide ONE clear poll question.',
        'Provide at least 4 answer options.',
        'One option MUST be: "Other (comment below)".',
        'End by encouraging people to comment what they chose and why.',
      ].join(' ')
    : ''

  const viralRules = isViral
    ? [
        'If "Viral trend commentary" is selected:',
        'Base the content on what is currently trending across major social platforms right now.',
        'Do NOT claim specific statistics or name specific copyrighted sounds/creators.',
        'Describe the trend format conceptually (e.g., POV, quick cuts, green-screen reaction, meme caption style), and write as if it is currently popular.',
      ].join(' ')
    : ''

  const outputRule = 'Return ONLY the finished content. No explanations. No markdown.'

  return [
    'You are an expert social media creator for a recruitment agency that hires into the electronic Security and fire & life safety industry (alarms, CCTV, access control, fire systems - not physical guarding or manned security).',
    hardRules,
    regionPart,
    audiencePart,
    tonePart,
    postTypePart,
    perspectivePart,
    topicPart,
    hookRule,
    pollRules,
    viralRules,
    'Avoid corporate clichés and buzzwords. Keep it human.',
    outputRule,
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
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a recruiter/consultant who hires for the electronic Security and fire & life safety industry. Never write as an engineer or installer. Never use extended dashes (— or –).',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.85,
        max_tokens: 900,
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
    let content: string =
      data?.choices?.[0]?.message?.content?.trim() || 'No content generated.'

    // Hard guarantee: remove extended dashes if the model ever outputs them
    content = content.replace(/[—–]/g, '-')

    return NextResponse.json({ content })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to generate content.', detail: err?.message },
      { status: 500 },
    )
  }
}

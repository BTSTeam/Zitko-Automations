import { NextResponse } from 'next/server'

type Body = {
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

function safeStr(v: any): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body

    const region = safeStr(body.region)
    const perspective = safeStr(body.perspective)
    const topics = Array.isArray(body.topics) ? body.topics.filter((t) => typeof t === 'string') : []
    const customTopic = safeStr(body.customTopic)

    const audience = safeStr(body.audience)
    const tone = safeStr(body.tone)
    const postType = safeStr(body.postType)
    const platform = safeStr(body.platform)
    const contentLength = safeStr(body.contentLength)
    const callToAction = !!body.callToAction

    const ownExperienceSelected = topics.includes('Own Experience / Story')
    const jobMarketSelected = topics.includes('Job Market Update')

    // Only treat free-type as "required" when one of these themes is selected
    if ((ownExperienceSelected || jobMarketSelected) && !customTopic) {
      return NextResponse.json(
        { error: 'Please add detail in the free type box for Own Experience / Story or Job Market Update.' },
        { status: 400 }
      )
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY.' }, { status: 500 })
    }

    const system = [
      'You write social media content ideas for recruiters in the Fire & Security industry (primarily electronic security).',
      'Do NOT mention "life safety" or "physical security".',
      'The poster is a recruiter/hiring partner for the industry (not an engineer/installer).',
      'Avoid AI clichés, overly salesy tone, and generic fluff.',
      'Return EXACTLY 2 different ideas.',
      'Format strictly as:',
      'Option 1',
      '<content>',
      '',
      'Option 2',
      '<content>',
    ].join('\n')

    const freeTypeInstruction = jobMarketSelected
      ? [
          'The user selected "Job Market Update". Use the user provided notes below as the basis for the update.',
          'Turn them into a clear, recruiter-style market update with practical, factual detail.',
          'If any category is missing, keep it brief rather than inventing specifics.',
          '',
          'User notes:',
          customTopic,
        ].join('\n')
      : ownExperienceSelected
      ? [
          'The user selected "Own Experience / Story". Use the user provided story/context below as the core of the post.',
          'Make it human, specific, and recruiter-relevant.',
          '',
          'User story/context:',
          customTopic,
        ].join('\n')
      : customTopic
      ? ['User extra context:', customTopic].join('\n')
      : ''

    const user = [
      `Region: ${region || 'N/A'}`,
      `Perspective: ${perspective || 'N/A'}`,
      `Audience: ${audience || 'N/A'}`,
      `Tone: ${tone || 'N/A'}`,
      `Post format: ${postType || 'N/A'}`,
      `Platform: ${platform || 'N/A'}`,
      `Content length: ${contentLength || 'N/A'}`,
      `Call to action: ${callToAction ? 'Yes' : 'No'}`,
      `Content themes: ${topics.length ? topics.join(', ') : 'N/A'}`,
      '',
      freeTypeInstruction,
      '',
      'Now generate the two options in the required format.',
    ]
      .filter(Boolean)
      .join('\n')

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })

    const json = await res.json().catch(() => ({} as any))
    if (!res.ok) {
      const msg =
        json?.error?.message ||
        json?.error ||
        `OpenAI request failed (${res.status})`
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'No content returned.' }, { status: 500 })
    }

    return NextResponse.json({ content })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 })
  }
}

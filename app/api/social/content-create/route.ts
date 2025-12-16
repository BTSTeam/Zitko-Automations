import { NextRequest, NextResponse } from 'next/server'

type ContentRequest = {
  region?: string | null
  audience?: string | null
  topics?: string[]
  customTopic?: string
  tone?: string | null
  postType?: string | null
  contentLength?: string | null
  platforms?: string[]
  perspective?: string | null
  includeHook?: boolean
}

function buildPrompt(body: ContentRequest): string {
  const {
    region,
    audience,
    topics = [],
    customTopic,
    tone,
    platforms = [],
    perspective,
    includeHook,
  } = body

  const isPoll = topics.includes('Polls & questions')
  const isViral = topics.includes('Viral trend commentary')

  return `
You are a recruitment consultant hiring into the electronic Security and fire & life safety industry.

ABSOLUTE RULES:
- NEVER use extended dashes (— or –). Use standard hyphen (-) only.
- Never speak as an engineer or installer.

${perspective ? `Perspective: write with a ${perspective.toLowerCase()} voice.` : ''}

${includeHook ? `
Include a strong opening hook.
If an audience is specified, tailor the hook to that audience.
If no audience is specified, create hooks that appeal to BOTH candidates and clients.
` : ''}

${isPoll ? `
This is a POLL.
- Ask a clear question
- Provide AT LEAST 4 answer options
- Include "Other (comment below)"
- End by encouraging comments
` : ''}

${isViral ? `
Base this on formats that are CURRENTLY TRENDING across major social platforms.
Do not reference specific copyrighted audio or creators.
` : ''}

Topic: ${[...topics, customTopic].filter(Boolean).join(' | ')}
Tone: ${tone || 'Conversational'}
Audience: ${audience || 'Candidates and Clients'}
Platforms: ${platforms.join(', ')}

Return ONLY the finished content. No markdown. No explanations.
`.trim()
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.CONTENT_CREATION_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key missing' }, { status: 500 })
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
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      max_tokens: 900,
    }),
  })

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content || ''

  return NextResponse.json({ content })
}

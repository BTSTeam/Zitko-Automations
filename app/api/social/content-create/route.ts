import { NextResponse } from 'next/server'

type Body = {
  region?: string | null
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

function isUSRegion(regionRaw: string): boolean {
  const r = safeStr(regionRaw).toLowerCase()
  return r === 'usa' || r === 'us' || r === 'united states' || r === 'united states of america'
}

/** Remove emojis / pictographs defensively. */
function stripEmojis(input: string): string {
  try {
    let out = input.replace(/\p{Extended_Pictographic}/gu, '')
    out = out.replace(/[\u200D\uFE0F]/g, '')
    out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    return out
  } catch {
    return input
  }
}

/** Remove smart dashes (em/en dashes) completely */
function stripSmartDashes(input: string): string {
  return input
    .replace(/\u2014/g, '') // em dash —
    .replace(/\u2013/g, '') // en dash –
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
}

/**
 * Fix ONLY "current-year" phrasing if the model incorrectly uses another year as "now".
 * This keeps genuine historic/future references intact.
 */
function fixMisstatedCurrentYear(input: string): string {
  let out = input

  out = out.replace(
    /\b(as\s+we\s+(?:navigate|move|head)\s+(?:through|into)\s+)20\d{2}\b/gi,
    (_m, p1) => `${p1}2026`
  )

  out = out.replace(
    /\b(this\s+year|so\s+far|to\s+date|currently|right\s+now|today)\s*\(?\s*(20\d{2})\s*\)?/gi,
    (m, p1, year) => (year === '2026' ? m : `${p1} 2026`)
  )

  out = out.replace(
    /\b(in|during)\s+(20\d{2})(?=\s+(?:so\s+far|to\s+date|currently|right\s+now)\b)/gi,
    (m, p1, year) => (year === '2026' ? m : `${p1} 2026`)
  )

  return out
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body

    const region = safeStr(body.region)
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

    const useUSSpelling = isUSRegion(region)

    const system = [
      'You write social media content ideas for recruiters in the Fire & Security industry (primarily electronic security).',
      'Do NOT mention "life safety" or "physical security".',
      'Responses should ALWAYS be gender neutral.',
      'The poster is a recruiter/hiring partner for the industry (not an engineer/installer).',
      'Avoid AI clichés, overly salesy tone, and generic fluff.',
      'Do NOT use emojis, emoticons, or icon bullets. Plain text only.',
      'Do NOT use em dashes, en dashes, or long punctuation dashes. Use commas or full stops only.',

      'Assume the current year is 2026.',
      'You MAY reference other years only if clearly framed as past or future.',
      'Never frame any year other than 2026 as the present.',

      useUSSpelling
        ? 'Use US English spelling.'
        : 'Use UK English spelling and punctuation. Do NOT use US spellings.',

      'Make the content easy to scan using short paragraphs and line breaks.',
      'Bullet points are OPTIONAL. If used, use hyphen bullets "-" only.',

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
          'Keep it practical and believable.',
          '',
          'User notes:',
          customTopic,
        ].join('\n')
      : ownExperienceSelected
      ? [
          'The user selected "Own Experience / Story". Use the user provided story/context below as the core of the post.',
          'Make it human, specific, and recruiter relevant.',
          '',
          'User story/context:',
          customTopic,
        ].join('\n')
      : customTopic
      ? ['User extra context:', customTopic].join('\n')
      : ''

    const user = [
      `Region: ${region || 'N/A'}`,
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
      'No emojis.',
      'Current year must be treated as 2026.',
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
      const msg = json?.error?.message || json?.error || `OpenAI request failed (${res.status})`
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const raw = json?.choices?.[0]?.message?.content
    if (typeof raw !== 'string' || !raw.trim()) {
      return NextResponse.json({ error: 'No content returned.' }, { status: 500 })
    }

    let content = stripEmojis(raw)
    content = stripSmartDashes(content)
    content = fixMisstatedCurrentYear(content)

    return NextResponse.json({ content })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 })
  }
}

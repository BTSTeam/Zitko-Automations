// app/api/activecampaign/lists/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { AC, requiredActiveCampaignEnv, config } from '@/lib/config'

/**
 * POST /api/activecampaign/lists
 * Body: { name: string }
 * Returns: { id: number, data: any }
 */
export async function POST(req: NextRequest) {
  try {
    requiredActiveCampaignEnv()
    const { name } = await req.json().catch(() => ({}))
    const listName = String(name ?? '').trim()
    if (!listName) {
      return NextResponse.json({ error: 'List name required' }, { status: 400 })
    }

    // slugify list name for stringid (lowercase, hyphens, no special chars)
    const slug = listName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    // Defaults – customise via env if desired
    const senderUrl =
      process.env.AC_SENDER_URL || config.AC_BASE_URL || 'https://example.com'
    const senderReminder =
      process.env.AC_SENDER_REMINDER ||
      'You are receiving this email because you opted in.'

    const body = {
      list: {
        name: listName,
        stringid: slug,
        sender_url: senderUrl,
        sender_reminder: senderReminder,
        // optional fields:
        // send_last_broadcast: false,
        // channel: 'email'
      },
    }

    const url = `${AC.BASE_URL}/api/3/lists`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Token': AC.API_TOKEN,
      },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {}

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || 'ActiveCampaign list creation failed', data },
        { status: res.status },
      )
    }

    // AC returns list.id inside the response
    const id =
      data?.list?.id || data?.id || data?.listId || data?.data?.id || null
    return NextResponse.json({ id, data }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 },
    )
  }
}

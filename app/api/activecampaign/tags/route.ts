export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { AC, requiredActiveCampaignEnv } from '@/lib/config'

export async function GET() {
  try {
    requiredActiveCampaignEnv()

    // Guard against trailing slash on BASE_URL so we don’t end up with //api/3
    const BASE = String(AC.BASE_URL || '').replace(/\/+$/, '')
    const limit = 100
    let offset = 0
    const all: any[] = []

    // Fetch until an empty/short page. Avoids relying on AC's meta.total.
    for (let safety = 0; safety < 200; safety++) {
      const url = `${BASE}/api/3/tags?limit=${limit}&offset=${offset}`
      const res = await fetch(url, {
        headers: { 'Api-Token': AC.API_TOKEN, Accept: 'application/json' },
        cache: 'no-store',
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return NextResponse.json(
          { error: `ActiveCampaign tags error ${res.status}: ${text}` },
          { status: res.status }
        )
      }

      const j = await res.json().catch(() => ({}))
      const page: any[] = Array.isArray(j?.tags) ? j.tags : []

      if (page.length === 0) break
      all.push(...page)

      if (page.length < limit) break
      offset += limit
    }

    return NextResponse.json({ tags: all }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

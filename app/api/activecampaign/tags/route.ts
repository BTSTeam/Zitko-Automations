export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { AC, requiredActiveCampaignEnv } from '@/lib/config'

export async function GET() {
  try {
    requiredActiveCampaignEnv()

    const limit = 100
    let offset = 0
    let total = Infinity
    const all: any[] = []

    while (offset < total) {
      const url = `${AC.BASE_URL}/api/3/tags?limit=${limit}&offset=${offset}`
      const res = await fetch(url, {
        headers: { 'Api-Token': AC.API_TOKEN, 'Accept': 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return NextResponse.json({ error: `ActiveCampaign tags error ${res.status}: ${text}` }, { status: res.status })
      }

      const j = await res.json().catch(() => ({}))
      const page: any[] = Array.isArray(j?.tags) ? j.tags : []
      const meta = j?.meta || {}
      const pageInput = meta?.page_input || {}
      total = typeof meta?.total === 'number' ? meta.total : total
      all.push(...page)
      offset += limit

      // Fallback break if meta is missing but page is small
      if (!meta?.total && page.length < limit) break
    }

    // Return a normalized shape
    return NextResponse.json({ tags: all }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}


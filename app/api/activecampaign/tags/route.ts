export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { AC, requiredActiveCampaignEnv } from '@/lib/config'

export async function GET() {
  try {
    requiredActiveCampaignEnv() // ensure env is set

    const url = `${AC.BASE_URL}/api/3/tags`
    const res = await fetch(url, {
      headers: { 'Api-Token': AC.API_TOKEN, 'Accept': 'application/json' },
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

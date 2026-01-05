// app/api/cron/upstash-ping/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

/**
 * Vercel Cron (or any scheduler) calls this endpoint periodically.
 * It performs a lightweight Redis op to prevent Upstash Free DB archiving.
 *
 * Security:
 * - Requires ?secret=CRON_SECRET
 * - Set CRON_SECRET in Vercel env vars
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret') ?? ''
    const expected = process.env.CRON_SECRET ?? ''

    if (!expected || secret !== expected) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Keep-alive: PING is enough (and is an operational command)
    const pong = await redis.ping()

    return NextResponse.json({
      ok: true,
      pong,
      at: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Ping failed' },
      { status: 500 },
    )
  }
}

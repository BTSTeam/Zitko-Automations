export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { kv } from '@/lib/redis' // adjust name if your redis export differs

type NotePair = { candidateId: string; note: string }
type InBody = { notes: NotePair[] }

export async function POST(req: NextRequest) {
  let body: InBody | null = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body?.notes || !Array.isArray(body.notes) || body.notes.length === 0) {
    return NextResponse.json({ error: 'notes[] required' }, { status: 400 })
  }

  const session = await getSession().catch(() => null)
  const userKey = (session?.user?.email || 'anon').toLowerCase()

  // store per user per candidate: ln:{user}:{candidateId}
  // TTL optional; uncomment if you want expiry (e.g., 30 days).
  for (const { candidateId, note } of body.notes) {
    const key = `ln:${userKey}:${candidateId}`
    await kv.set(key, note)
    // await kv.expire(key, 60 * 60 * 24 * 30)
  }

  return NextResponse.json({ ok: true })
}

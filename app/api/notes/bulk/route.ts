// app/api/notes/bulk/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { redis } from '@/lib/redis' // ✅ your existing export

type NotePair = { candidateId: string; note: string }
type InBody = { notes: NotePair[] }

export async function POST(req: NextRequest) {
  // Parse body
  let body: InBody | null = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body?.notes || !Array.isArray(body.notes) || body.notes.length === 0) {
    return NextResponse.json({ error: 'notes[] required' }, { status: 400 })
  }

  // Identify user (per-user key space)
  const session = await getSession().catch(() => null)
  const userKey = (session?.user?.email || 'anon').toLowerCase()

  // Store each note as: ln:{user}:{candidateId} -> note
  try {
    await Promise.all(
      body.notes.map(({ candidateId, note }) => {
        const key = `ln:${userKey}:${candidateId}`
        // Optional TTL (30 days): redis.set(key, note, { ex: 60 * 60 * 24 * 30 })
        return redis.set(key, note)
      })
    )
  } catch {
    return NextResponse.json({ error: 'Failed to store notes' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { clearTokens } from '@/lib/tokenStore'

export async function POST() {
  const session = await getSession()
  const userKey = session.user?.email || session.sessionId || ''
  if (userKey) await clearTokens(userKey)
  await session.destroy()
  return NextResponse.json({ ok: true })
}

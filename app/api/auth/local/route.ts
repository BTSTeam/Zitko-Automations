export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  // Demo auth: accept anything non-empty. Replace with real auth later.
  const session = await getSession()
  session.user = { email: String(email) }
  await session.save()

  return NextResponse.json({ ok: true })
}

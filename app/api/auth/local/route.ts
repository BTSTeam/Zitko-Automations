export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ensureSeedAdmin, getUserByEmail, verifyPassword } from '@/lib/users'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  // Make sure there is at least one admin
  ensureSeedAdmin()

  const user = getUserByEmail(String(email))
  if (!user || !user.active || !verifyPassword(user, String(password))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const session = await getSession()
  // IMPORTANT: include role & active so the client can gate by role
  session.user = { email: user.email, role: user.role, active: user.active }
  await session.save()

  return NextResponse.json({
    ok: true,
    user: { email: user.email, role: user.role, active: user.active },
  })
}

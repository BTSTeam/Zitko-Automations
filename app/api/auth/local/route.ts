export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ensureSeedAdmin, getUserByEmail, verifyPassword, type User } from '@/lib/users'

export async function POST(req: NextRequest) {
  await ensureSeedAdmin()

  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string
    password?: string
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const user = await getUserByEmail(String(email))
  if (!user || !user.active || !(await verifyPassword(user, String(password)))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // set session
  const session = await getSession()
  session.user = { email: user.email }
  await session.save()

  return NextResponse.json({
    ok: true,
    email: user.email,
    role: user.role,
    name: user.name ?? null,
    active: user.active,
  })
}

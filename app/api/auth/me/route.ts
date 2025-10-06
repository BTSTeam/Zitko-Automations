import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ensureSeedAdmin, getUserByEmail } from '@/lib/users'

export const dynamic = 'force-dynamic'

export async function GET() {
  // ensure the seeded admin exists (as your codebase already does elsewhere)
  ensureSeedAdmin()

  const session = await getSession()
  const email = session.user?.email || null

  if (!email) {
    return NextResponse.json({ user: null })
  }

  // Look up full user (role, active, etc.) from your store
  const u = getUserByEmail(email) || null

  // fall back to what’s in session if store lookup fails
  const role = u?.role ?? session.user?.role ?? null
  const active = typeof u?.active === 'boolean' ? u.active : (session.user as any)?.active ?? true

  return NextResponse.json({
    user: email ? { email, role, active } : null
  })
}

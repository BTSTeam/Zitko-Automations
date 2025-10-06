import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ensureSeedAdmin, getUserByEmail } from '@/lib/users'

export const dynamic = 'force-dynamic'

export async function GET() {
  ensureSeedAdmin()
  const session = await getSession()
  const email = session.user?.email || null
  if (!email) return NextResponse.json({ user: null })

  // Pull canonical user (role/active) from store, fallback to session
  const u = getUserByEmail(email) || null
  const role = u?.role ?? session.user?.role ?? null
  const active = typeof u?.active === 'boolean' ? u.active : (session.user as any)?.active ?? true

  return NextResponse.json({ user: email ? { email, role, active } : null })
}

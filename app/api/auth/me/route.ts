export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ensureSeedAdmin, getUserByEmail } from '@/lib/users'

export async function GET() {
  ensureSeedAdmin()
  const session = await getSession()
  const email = session.user?.email || null

  let role: 'Admin' | 'User' | null = null
  let active: boolean | null = null

  if (email) {
    const u = getUserByEmail(email)
    if (u) {
      role = u.role
      active = u.active
    }
  }

  const loggedIn = Boolean((email && active !== false) || session.tokens?.idToken)
  return NextResponse.json({ loggedIn, email, role, active })
}


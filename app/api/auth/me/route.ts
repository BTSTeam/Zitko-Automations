export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ensureSeedAdmin, getUserByEmail } from '@/lib/users'

export async function GET() {
  await ensureSeedAdmin()
  const session = await getSession()
  const email = session.user?.email ?? null

  let role: 'Admin' | 'User' | null = null
  let active: boolean | null = null
  let name: string | null = null

  if (email) {
    const u = await getUserByEmail(email)
    if (u) {
      role = u.role
      active = u.active
      name = u.name ?? null
    }
  }

  const vincereConnected = !!session.tokens?.idToken
  const loggedIn = Boolean((email && active !== false) || vincereConnected)

  return NextResponse.json({ loggedIn, email, name, role, active, vincereConnected })
}

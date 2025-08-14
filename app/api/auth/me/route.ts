export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  const email = session.user?.email || null
  const loggedIn = Boolean(email || session.tokens?.idToken)
  return NextResponse.json({ loggedIn, email })
}

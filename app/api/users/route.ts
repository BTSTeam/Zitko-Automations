export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  ensureSeedAdmin,
  listUsers,
  createUser,
  getUserByEmail,
  type User,
  type Role,
} from '@/lib/users'

function sanitize(u: User) {
  const { passwordHash, salt, ...safe } = u
  return safe
}

async function requireAdmin() {
  ensureSeedAdmin()
  const session = await getSession()
  const email = session.user?.email
  if (!email) return null
  const me = getUserByEmail(email)
  if (!me || me.role !== 'Admin' || !me.active) return null
  return me
}

export async function GET() {
  const me = await requireAdmin()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(listUsers().map(sanitize))
}

export async function POST(req: NextRequest) {
  const me = await requireAdmin()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const { email, name, role = 'User', password } = body as {
    email?: string
    name?: string
    role?: Role
    password?: string
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (role !== 'Admin' && role !== 'User') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  try {
    const u = createUser({ email, name, role, password })
    return NextResponse.json(sanitize(u), { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Create failed' }, { status: 400 })
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  ensureSeedAdmin,
  getUserByEmail,
  updateUser,
  deleteUser,
  type User,
  type Role,
} from '@/lib/users'

function sanitize(u: User) {
  const { passwordHash, salt, ...safe } = u
  return safe
}

async function requireAdmin() {
  await ensureSeedAdmin()
  const session = await getSession()
  const email = session.user?.email
  if (!email) return null
  const me = await getUserByEmail(email)
  if (!me || me.role !== 'Admin' || !me.active) return null
  return me
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAdmin()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const { name, role, active, password, workPhone } = body as {
    name?: string
    role?: Role
    active?: boolean
    password?: string
    workPhone?: string | null
  }
  if (role && role !== 'Admin' && role !== 'User') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  try {
    const u = await updateUser(params.id, { name, role, active, password, workPhone })
    return NextResponse.json(sanitize(u))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update failed' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAdmin()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await deleteUser(params.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 400 })
  }
}

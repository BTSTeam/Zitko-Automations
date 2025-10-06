// lib/requireAdmin.ts
import { getSession } from '@/lib/session'
import { ensureSeedAdmin, getUserByEmail } from '@/lib/users'

export async function requireAdmin() {
  ensureSeedAdmin()
  const session = await getSession()
  const email = session.user?.email
  if (!email) return null
  const me = getUserByEmail(email)
  if (!me || me.role !== 'Admin' || !me.active) return null
  return me
}

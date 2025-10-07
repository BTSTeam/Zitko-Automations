// lib/users.ts
import crypto from 'crypto'
import { redis } from './redis'

export type Role = 'Admin' | 'User'
export type User = {
  id: string
  email: string
  name?: string
  role: Role
  active: boolean

  // Optional work phone (E.164 preferred). Null/undefined = not set.
  workPhone?: string | null

  // password = sha256(salt + plain)
  passwordHash: string
  salt: string
  createdAt: string
}

// ---------------- Keys & helpers ----------------
const ALL_IDS_KEY = 'users:all' // Set of all user ids
const USER_KEY = (id: string) => `user:${id}` // Hash per user
const EMAIL_IDX = (email: string) => `user:email:${email.toLowerCase().trim()}` // String => id

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

// Convert HGETALL result to User
function hydrateUser(obj: Record<string, string | number | null> | null): User | null {
  if (!obj) return null
  return {
    id: String(obj.id ?? ''),
    email: String(obj.email ?? ''),
    name: obj.name ? String(obj.name) : undefined,
    role: (obj.role as Role) ?? 'User',
    active: String(obj.active ?? 'true') === 'true',
    workPhone:
      obj.workPhone === null ||
      obj.workPhone === 'null' ||
      String(obj.workPhone ?? '').trim() === ''
        ? null
        : String(obj.workPhone),
    passwordHash: String(obj.passwordHash ?? ''),
    salt: String(obj.salt ?? ''),
    createdAt: String(obj.createdAt ?? new Date().toISOString()),
  }
}

export async function verifyPassword(user: User, plain: string) {
  const hash = sha256(user.salt + plain)
  return hash === user.passwordHash
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const id = await redis.get(EMAIL_IDX(email))
  if (typeof id !== 'string' || !id) return null
  const data = await redis.hgetall<Record<string, string>>(USER_KEY(id))
  return hydrateUser(data)
}

export async function listUsers(): Promise<User[]> {
  const ids = (await redis.smembers(ALL_IDS_KEY)) as string[]
  if (!ids?.length) return []
  const users: User[] = []
  for (const id of ids) {
    const data = await redis.hgetall<Record<string, string>>(USER_KEY(id))
    const u = hydrateUser(data)
    if (u) users.push(u)
  }
  users.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return users
}

export async function createUser(input: {
  email: string
  name?: string
  role?: Role
  password: string
  workPhone?: string | null
}): Promise<User> {
  const email = (input.email ?? '').toLowerCase().trim()
  if (!email) throw new Error('Email is required')
  if (!input.password) throw new Error('Password is required')

  // Reserve email -> id (NX ensures uniqueness)
  const id = crypto.randomUUID()
  const reserved = await redis.set(EMAIL_IDX(email), id, { nx: true })
  if (reserved !== 'OK') {
    throw new Error('Email already exists')
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = sha256(salt + input.password)

  // normalize work phone: empty string => null; undefined => null
  const normalizedWorkPhone =
    typeof input.workPhone === 'undefined'
      ? null
      : (input.workPhone ?? '').trim() === ''
      ? null
      : (input.workPhone ?? '').trim()

  const user: User = {
    id,
    email,
    name: input.name?.trim(),
    role: input.role ?? 'User',
    active: true,
    workPhone: normalizedWorkPhone,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  }

  // Save user and index
  await Promise.all([
    redis.hset(USER_KEY(id), user as any),
    redis.sadd(ALL_IDS_KEY, id),
  ])

  return user
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<User, 'name' | 'role' | 'active' | 'workPhone'>> & { password?: string }
): Promise<User> {
  const key = USER_KEY(id)
  const current = hydrateUser(await redis.hgetall<Record<string, string>>(key))
  if (!current) throw new Error('User not found')

  // Email is immutable here (keeps EMAIL_IDX simple & safe)
  const next: User = { ...current }

  if (typeof patch.name !== 'undefined') next.name = patch.name?.trim()
  if (typeof patch.role !== 'undefined') next.role = patch.role
  if (typeof patch.active !== 'undefined') next.active = !!patch.active

  if (typeof patch.workPhone !== 'undefined') {
    if (patch.workPhone === null) next.workPhone = null
    else {
      const trimmed = patch.workPhone?.trim() ?? ''
      next.workPhone = trimmed === '' ? null : trimmed
    }
  }

  if (typeof patch.password === 'string' && patch.password.length > 0) {
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = sha256(salt + patch.password)
    next.salt = salt
    next.passwordHash = passwordHash
  }

  await redis.hset(key, next as any)
  return next
}

export async function deleteUser(id: string): Promise<void> {
  const key = USER_KEY(id)
  const current = hydrateUser(await redis.hgetall<Record<string, string>>(key))
  if (!current) return

  await Promise.all([
    redis.del(EMAIL_IDX(current.email)),
    redis.del(key),
    redis.srem(ALL_IDS_KEY, id),
  ])
}

// Seed a default admin if store is empty (so you’re never locked out)
export async function ensureSeedAdmin() {
  const count = await redis.scard(ALL_IDS_KEY)
  if ((count ?? 0) > 0) return

  const email = 'stephenr@zitko.co.uk'
  const password = 'Arlojuan1.'

  try {
    await createUser({
      email,
      name: 'Stephen Rosamond',
      role: 'Admin',
      password,
      workPhone: null,
    })
  } catch {
    // if it already exists, ignore
  }
}

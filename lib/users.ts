// lib/users.ts
import crypto from 'crypto'

export type Role = 'Admin' | 'User'
export type User = {
  id: string
  email: string
  name?: string
  role: Role
  active: boolean
  // password = sha256(salt + plain)
  passwordHash: string
  salt: string
  createdAt: string
}

// In-memory store (persists per server instance). We'll swap to Postgres later.
const GLOBAL_KEY = '__zitko_users__'
const g = globalThis as any
if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, User>()
const store: Map<string, User> = g[GLOBAL_KEY]

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function verifyPassword(user: User, plain: string) {
  const hash = sha256(user.salt + plain)
  return hash === user.passwordHash
}

export function getUserByEmail(email: string) {
  email = email.toLowerCase().trim()
  for (const u of store.values()) {
    if (u.email.toLowerCase() === email) return u
  }
  return null
}

export function listUsers(): User[] {
  // order by createdAt desc
  return Array.from(store.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function createUser(input: {
  email: string
  name?: string
  role?: Role
  password: string
}): User {
  const email = input.email.toLowerCase().trim()
  if (!email) throw new Error('Email is required')
  if (getUserByEmail(email)) throw new Error('Email already exists')
  if (!input.password) throw new Error('Password is required')

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = sha256(salt + input.password)
  const user: User = {
    id: crypto.randomUUID(),
    email,
    name: input.name?.trim(),
    role: input.role ?? 'User',
    active: true,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  }
  store.set(user.id, user)
  return user
}

export function updateUser(
  id: string,
  patch: Partial<Pick<User, 'name' | 'role' | 'active'>> & { password?: string }
): User {
  const u = store.get(id)
  if (!u) throw new Error('User not found')

  if (typeof patch.name !== 'undefined') u.name = patch.name?.trim()
  if (typeof patch.role !== 'undefined') u.role = patch.role
  if (typeof patch.active !== 'undefined') u.active = !!patch.active

  if (typeof patch.password === 'string' && patch.password.length > 0) {
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = sha256(salt + patch.password)
    u.salt = salt
    u.passwordHash = passwordHash
  }

  store.set(u.id, u)
  return u
}

export function deleteUser(id: string) {
  store.delete(id)
}

// Seed a default admin if store is empty (so you’re never locked out)
export function ensureSeedAdmin() {
  if (store.size > 0) return
  const email = 'admin@example.com'
  const password = 'changeMe123!'
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = sha256(salt + password)
  const user: User = {
    id: crypto.randomUUID(),
    email,
    name: 'Admin',
    role: 'Admin',
    active: true,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  }
  store.set(user.id, user)
}

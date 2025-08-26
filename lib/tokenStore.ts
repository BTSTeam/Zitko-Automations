// lib/tokenStore.ts
import { Redis } from '@upstash/redis'
const redis = Redis.fromEnv()
const key = (k: string) => `vincere:rt:${k}`

export async function saveRefreshToken(userKey: string, refreshToken?: string) {
  if (!userKey || !refreshToken) return
  await redis.hset(key(userKey), { rt: refreshToken })
  await redis.expire(key(userKey), 60 * 60 * 24 * 45) // ~45 days
}

export async function getRefreshToken(userKey: string): Promise<string | null> {
  if (!userKey) return null
  const data = await redis.hgetall<{ rt?: string }>(key(userKey))
  return data?.rt ?? null
}

export async function clearTokens(userKey: string) {
  if (!userKey) return
  await redis.del(key(userKey))
}

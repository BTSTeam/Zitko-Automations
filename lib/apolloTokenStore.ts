// lib/apolloTokenStore.ts (new file)
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()
const key = (userKey: string) => `apollo:rt:${userKey}`

export async function saveApolloRefreshToken(userKey: string, refreshToken?: string) {
  if (!userKey || !refreshToken) return
  await redis.hset(key(userKey), { rt: refreshToken })
  await redis.expire(key(userKey), 60 * 60 * 24 * 30) // expire ~30 days
}

export async function getApolloRefreshToken(userKey: string): Promise<string | null> {
  if (!userKey) return null
  const data = await redis.hgetall<{ rt?: string }>(key(userKey))
  return data?.rt ?? null
}

export async function clearApolloTokens(userKey: string) {
  if (!userKey) return
  await redis.del(key(userKey))
}

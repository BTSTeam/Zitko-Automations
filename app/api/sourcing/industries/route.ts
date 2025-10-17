// app/api/sourcing/industries/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { config, requiredEnv } from '@/lib/config'
import { getSession } from '@/lib/session'
import { refreshIdToken } from '@/lib/vincereRefresh'

type VincereIndustry = { id?: string | number; name?: string }

async function ensureVincereToken(): Promise<string | null> {
  try {
    requiredEnv() // enforces VINCERE_* & REDIRECT_URI
  } catch (e) {
    console.error('Missing Vincere env vars', e)
    return null
  }

  const session = await getSession()
  if (session?.tokens?.idToken) return session.tokens.idToken

  const ok = await refreshIdToken('default') // adjust user key if needed
  if (!ok) return null

  const session2 = await getSession()
  return session2?.tokens?.idToken ?? null
}

async function fetchIndustries(idToken: string): Promise<VincereIndustry[]> {
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')

  // Prefer v2 if available
  const candidates = [`${base}/api/v2/industries`, `${base}/industries`]

  let lastErr: string | null = null
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.VINCERE_API_KEY!,
          Authorization: `Bearer ${idToken}`,
          'Cache-Control': 'no-store',
        },
      })

      const text = await res.text().catch(() => '')
      let json: any = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        // ignore parse error, fallback to raw
      }

      if (!res.ok) {
        lastErr = `Industries ${res.status}: ${json?.error || text || 'Unknown error'}`
        continue
      }

      // Common shapes:
      // - { items: [{id,name}, ...] }
      // - { data: [{id,name}, ...] }
      // - [ {id,name}, ... ]
      const list: VincereIndustry[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
        ? json.data
        : []

      return list
    } catch (e: any) {
      lastErr = e?.message || 'Network error'
      continue
    }
  }

  throw new Error(lastErr || 'Failed to load industries')
}

export async function GET() {
  try {
    const idToken = await ensureVincereToken()
    if (!idToken) {
      return NextResponse.json(
        { error: 'Unable to obtain Vincere token. Ensure OAuth is connected.' },
        { status: 401 },
      )
    }

    const raw = await fetchIndustries(idToken)

    // Normalize + sort
    const industries = raw
      .map((x) => ({
        id: x?.id,
        name: typeof x?.name === 'string' ? x.name : '',
      }))
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ industries }, { status: 200 })
  } catch (e: any) {
    console.error('industries route error', e)
    return NextResponse.json(
      { error: e?.message || 'Unknown server error' },
      { status: 500 },
    )
  }
}

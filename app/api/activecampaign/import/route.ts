export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { AC } from '@/lib/config'
import { getSession } from '@/lib/session' // to enforce admin

type Candidate = {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  city?: string
}

function ensureAdminOrThrow(session: any) {
  const role = session.user?.role ?? 'user'
  if (role !== 'admin') {
    throw new Response('Forbidden', { status: 403 })
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// crude estimator to stay under ~350KB JSON per chunk (safety margin from 400KB)
function bytes(str: string) {
  return Buffer.byteLength(str, 'utf8')
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    ensureAdminOrThrow(session)

    if (!AC.BASE_URL || !AC.API_TOKEN) {
      return NextResponse.json(
        { error: 'ActiveCampaign is not configured (BASE_URL/API_TOKEN).' },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { candidates, tagName, listIds = [], excludeAutomations = true } = body as {
      candidates: Candidate[]
      tagName?: string // optional; can be empty if you don’t want tags
      listIds?: number[] // optional AC list IDs to subscribe
      excludeAutomations?: boolean
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json({ error: 'No candidates provided.' }, { status: 400 })
    }

    // map Vincere candidates -> AC contacts
    const mapped = candidates
      .filter(c => c.email && /\S+@\S+\.\S+/.test(c.email))
      .map(c => {
        const contact: any = {
          email: c.email,
        }
        if (c.first_name) contact.first_name = c.first_name
        if (c.last_name) contact.last_name = c.last_name
        if (c.phone) contact.phone = c.phone

        // Optional list subscriptions
        const subscribe = (listIds || []).map((listid: number) => ({ listid }))

        // Tags by name (lets AC create if missing)
        const tags = tagName ? [tagName] : []

        return {
          ...contact,
          ...(subscribe.length ? { subscribe } : {}),
          ...(tags.length ? { tags } : {}),
        }
      })

    if (mapped.length === 0) {
      return NextResponse.json({ error: 'No candidates with valid emails.' }, { status: 400 })
    }

    // AC supports up to 250 contacts per request; also keep payload < 400KB
    const CONTACTS_MAX = 250
    const chunks = chunk(mapped, CONTACTS_MAX)

    const results: any[] = []
    for (const group of chunks) {
      // shrink group until under ~350KB
      let payload = {
        contacts: group,
        callback: undefined, // optional: you can add a callback here if you want
        exclude_automations: !!excludeAutomations,
      }
      let json = JSON.stringify(payload)
      while (bytes(json) > 350_000 && group.length > 1) {
        group.pop()
        payload = { ...payload, contacts: group }
        json = JSON.stringify(payload)
      }

      const url = `${AC.BASE_URL.replace(/\/$/, '')}/api/3/import/bulk_import`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Token': AC.API_TOKEN,
        },
        body: json,
      })

      const text = await res.text()
      let data: any = text
      try { data = JSON.parse(text) } catch { /* keep raw text */ }

      if (!res.ok) {
        results.push({ ok: false, status: res.status, data })
        // you could break here or continue importing later chunks
      } else {
        results.push({ ok: true, status: res.status, data })
      }

      // Respect AC rate limits (multi-contact ≤ 100 req/min); a tiny delay is polite
      await new Promise(r => setTimeout(r, 250))
    }

    return NextResponse.json({ results }, { status: 200 })
  } catch (e: any) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}

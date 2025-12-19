// app/api/activecampaign/import/route.ts

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { AC, requiredActiveCampaignEnv } from '@/lib/config'

type Candidate = {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  city?: string
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function bytes(str: string) {
  return Buffer.byteLength(str, 'utf8')
}

export async function POST(req: NextRequest) {
  try {
    requiredActiveCampaignEnv()

    const body = await req.json()

    const {
      candidates,
      tagName,            // legacy single tag
      tagNames,           // new multiple-tag support
      listIds = [],
      excludeAutomations = true,
    } = body as {
      candidates: Candidate[]
      tagName?: string
      tagNames?: string[]
      listIds?: number[]
      excludeAutomations?: boolean
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json({ error: 'No candidates provided.' }, { status: 400 })
    }

    // Merge old + new tag formats
    const allTags = [
      ...(tagName ? [tagName] : []),
      ...(Array.isArray(tagNames) ? tagNames : [])
    ].filter(Boolean)

    const mapped = candidates
      .filter(c => c.email && String(c.email).trim())
      .map(c => {
        const contact: any = { email: c.email }
        if (c.first_name) contact.first_name = c.first_name
        if (c.last_name) contact.last_name = c.last_name
        if (c.phone) contact.phone = c.phone

        const subscribe = listIds.map((listid: number) => ({ listid }))

        return {
          ...contact,
          ...(subscribe.length ? { subscribe } : {}),
          ...(allTags.length ? { tags: allTags } : {}),
        }
      })

    if (mapped.length === 0) {
      return NextResponse.json(
        { error: 'No candidates with email addresses.' },
        { status: 400 }
      )
    }

    // AC bulk import limits
    const CONTACTS_MAX = 250
    const chunks = chunk(mapped, CONTACTS_MAX)

    const results: any[] = []

    for (const group of chunks) {
      let payload = {
        contacts: group,
        callback: undefined as any,
        exclude_automations: !!excludeAutomations,
      }

      let json = JSON.stringify(payload)

      // keep under AC request limit (~350KB)
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
      try {
        data = JSON.parse(text)
      } catch {}

      results.push({ ok: res.ok, status: res.status, data })

      // AC bulk import limit = 100 req/min
      await new Promise(r => setTimeout(r, 250))
    }

    return NextResponse.json({ results }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

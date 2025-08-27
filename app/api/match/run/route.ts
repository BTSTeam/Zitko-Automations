// app/api/job/extract/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

function esc(s?: string) { return (s ?? '').trim() }

// Return a broader, city-level label from a raw location string.
// Example: "South West London, UK" -> "London"
function broadenLocation(raw?: string): string {
  const v = esc(raw)
  if (!v) return ''
  // work with the part before the first comma
  const head = v.split(',')[0].trim()

  const cityList = [
    'London','Manchester','Birmingham','Leeds','Glasgow','Liverpool','Edinburgh',
    'Bristol','Sheffield','Newcastle','Nottingham','Leicester','Cambridge','Oxford',
    'Reading','Milton Keynes','Cardiff','Belfast'
  ]

  const lower = head.toLowerCase()
  for (const city of cityList) {
    if (lower.includes(city.toLowerCase())) return city
  }

  // Strip common directional prefixes (e.g., “South West London” -> “London”)
  const dir = /^(north|south|east|west|northeast|northwest|southeast|southwest)\s+/i
  const stripped = head.replace(dir, '').trim()
  // If removing a prefix shortened it to a single trailing token, use that
  if (stripped && stripped.split(/\s+/).length <= 2) return stripped

  return head // fallback: first segment unchanged
}

export async function POST(req: NextRequest) {
  requiredEnv()
  const { jobId } = await req.json().catch(() => ({})) as { jobId?: string }
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`

  const call = async () =>
    fetch(positionUrl(jobId), {
      headers: { 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY },
      cache: 'no-store',
    })

  let r = await call()
  if (r.status === 401 || r.status === 403) {
    if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
      const s2 = await getSession(); idToken = s2.tokens?.idToken; r = await call()
    }
  }
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    return NextResponse.json({ error: 'Failed to load position', detail }, { status: r.status || 400 })
  }

  const pos = await r.json().catch(() => ({}))

  // Canonical job summary (with broadened location)
  const title =
    pos.job_title || pos.title || pos.name || ''
  const locationRaw =
    pos['location-text'] || pos.location_text || pos.location || pos.city || ''
  const location = broadenLocation(locationRaw)

  const skills: string[] =
    Array.isArray(pos.skills)
      ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean)
      : typeof pos.keywords === 'string'
        ? pos.keywords.split(',').map((t: string) => t.trim()).filter(Boolean)
        : []

  const description = String(
    pos.public_description || pos.publicDescription || pos.description || ''
  )

  // Return exactly what the UI needs to populate the Job Summary form
  return NextResponse.json({
    job: {
      title,
      location,        // ← BROAD city-level term (e.g., London)
      skills,
      description,
    },
    raw: { id: pos.id ?? pos.position_id ?? jobId } // optional for debugging
  })
}

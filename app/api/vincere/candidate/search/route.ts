import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'

export async function POST(req: NextRequest) {
  requiredEnv()

  const session = await getSession()
  const idToken = session.tokens?.idToken
  if (!idToken) {
    return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const { jobTitle, locationText, industryIds = [], skills = [], qualifications = [] } = body ?? {}

  // Build your SOLR/matrix vars URL here (placeholder path shown)
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const url = `${base}/api/v2/candidate/search/${'' /* put matrix vars here if needed */}`

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'id-token': idToken,
      'x-api-key': config.VINCERE_API_KEY,
    },
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return NextResponse.json({ error: 'Vincere search failed', detail: text }, { status: 400 })
  }

  const data = await resp.json()
  return NextResponse.json(data)
}

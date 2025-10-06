export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config } from '@/lib/config'

export async function GET() {
  const s = await getSession()
  const id = s.tokens?.idToken
  if (!id) return NextResponse.json({ error: 'no id-token' }, { status: 401 })

  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const url = `${base}/api/v2/candidate/search/;fl=id,first_name,last_name;sort=created_date desc?q=*:*&limit=1`

  const r = await fetch(url, {
    headers: { accept: 'application/json', 'id-token': id, 'x-api-key': config.VINCERE_API_KEY },
    cache: 'no-store'
  })
  const text = await r.text()
  return new NextResponse(text, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'

function escapeForSolrPhrase(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/#/g, '\\#')
}

export async function POST(req: NextRequest) {
  try {
    requiredEnv()

    const body = await req.json().catch(() => ({}))
    const titleRaw = String(body?.job?.title || '').trim()
    const page = Math.max(1, Number(body?.page || 1))
    const limit = Math.max(1, Number(body?.limit || 20))

    if (!titleRaw) {
      return NextResponse.json({ error: 'Missing job.title' }, { status: 400 })
    }

    const session = await getSession()
    // FIX: use idToken only (matches your Tokens type)
    const idToken = session?.tokens?.idToken ?? session?.idToken
    if (!idToken) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const fl =
      'id,first_name,last_name,current_location_name,current_job_title,linkedin'
    const sort = 'created_date desc'

    const safeTitle = escapeForSolrPhrase(titleRaw)
    const q = `current_job_title:"${safeTitle}"#`

    const start = (page - 1) * limit
    const rows = limit

    const matrix = `fl=${encodeURIComponent(fl)};sort=${encodeURIComponent(sort)}`
    const url =
      `${config.VINCERE_TENANT_API_BASE}` +
      `/api/v2/candidate/search/${matrix}` +
      `?q=${encodeURIComponent(q)}&rows=${rows}&start=${start}`

    const r = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'id-token': idToken,
        'x-api-key': config.VINCERE_API_KEY,
      },
      cache: 'no-store',
    })

    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return NextResponse.json(
        { error: 'Vincere search failed', status: r.status, details: text },
        { status: 502 }
      )
    }

    const data = await r.json().catch(() => ({} as any))
    const items: any[] = data?.results ?? data?.items ?? data?.docs ?? []
    const total =
      Number(data?.total ?? data?.count ?? (Array.isArray(items) ? items.length : 0)) ||
      0

    const results = (items || [])
      .map((c: any) => ({
        candidateId: String(c?.id ?? c?.candidate_id ?? ''),
        candidateName: [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim(),
        score: 0,
        reason: 'Title match',
        linkedin: c?.linkedin ?? c?.linkedin_url ?? undefined,
      }))
      .filter((x) => x.candidateId)

    return NextResponse.json({ results, total, page, limit })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Server error', details: String(err?.message || err) },
      { status: 500 }
    )
  }
}

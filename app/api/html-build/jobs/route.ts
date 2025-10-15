// app/api/html-build/jobs/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

const VINCERE_BASE_URL = process.env.VINCERE_BASE_URL || 'https://api.vincere.io'
const VINCERE_API_KEY = process.env.VINCERE_API_KEY || ''

// Utility: build a simple /position/search call using fl & fq
async function fetchJobById(id: string) {
  if (!VINCERE_API_KEY) throw new Error('VINCERE_API_KEY missing')
  const fl = encodeURIComponent('id,job_title,formatted_salary_to,location,internal_description,public_description,owners')
  const fq = encodeURIComponent(`id:${id}`)
  const url = `${VINCERE_BASE_URL}/position/search/fl=${fl}&fq=${fq}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-api-key': VINCERE_API_KEY,
    },
  })
  if (!res.ok) throw new Error(`Vincere ${id} failed: ${res.status} ${res.statusText}`)
  const data = await res.json()
  // search responses may be {docs:[...]}, or array — normalise:
  const doc = (data?.docs?.[0] ?? data?.[0] ?? data) || null
  return doc
}

export async function POST(req: NextRequest) {
  try {
    const { jobIds } = await req.json()
    if (!Array.isArray(jobIds)) {
      return NextResponse.json({ error: 'jobIds must be array' }, { status: 400 })
    }
    const ids = jobIds.map((s: any) => String(s || '').trim()).filter(Boolean)
    if (ids.length === 0) {
      return NextResponse.json({ jobs: [] })
    }

    const jobs = []
    for (const id of ids) {
      try {
        const job = await fetchJobById(id)
        if (job) jobs.push(job)
      } catch (e) {
        // swallow single-job errors so others can proceed
      }
    }
    return NextResponse.json({ jobs })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

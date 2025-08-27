// Next.js API route for candidate matching and AI scoring.
//
// This endpoint accepts a jobId or a job object and performs three
// increasingly broad candidate searches against Vincere’s candidate search
// API. The strategies are:
// 1. Match the job title (and similar titles) AND the job location AND up to three skills.
// 2. Match the job title (and similar titles) AND the job location.
// 3. Match the job title (and similar titles) only.
//
// All retrieved candidates are de‑duplicated, then sent to an AI scoring
// endpoint (/api/ai/analyze) before being returned to the caller.

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { config, requiredEnv } from '@/lib/config'
import { refreshIdToken } from '@/lib/vincereRefresh'

type RunReq = {
  jobId?: string
  job?: {
    title?: string
    location?: string
    skills?: string[]
    qualifications?: string[]
    description?: string
  }
  page?: number
  limit?: number
  debug?: boolean
}

// -----------------------------------------------------------------------------
// Helper functions
//
// Escape quotes for inclusion in queries. Always trim surrounding whitespace.
function esc(s?: string) {
  return (s ?? '').replace(/"/g, '\\"').trim()
}

// Split a string into meaningful tokens. Remove trivial words and very short
// fragments. Tokens are used for token‑AND matching across fields.
function splitTokens(v?: string) {
  if (!v) return [] as string[]
  const stopwords = new Set(['&', 'and', 'of', 'the', '/', '-', '|'])
  return v
    .split(/[\s,/|\-]+/g)
    .map((t) => t.trim())
    .filter((t) => t && !stopwords.has(t.toLowerCase()) && t.length >= 2)
}

// Build a token‑AND clause across multiple fields. Each token must match at
// least one of the provided fields. Example:
// tokensANDFields(['current_job_title','job_title'], 'Security Engineer')
// → '(current_job_title:Security# OR job_title:Security#) AND (current_job_title:Engineer# OR job_title:Engineer#)'
function tokensANDFields(fields: string[], value?: string) {
  const toks = splitTokens(value)
  if (!toks.length) return ''
  return toks
    .map((tok) => `(${fields.map((f) => `${f}:${esc(tok)}#`).join(' OR ')})`)
    .join(' AND ')
}

// Build an exact phrase clause across multiple fields. Example:
// termFields(['current_job_title','job_title'], 'Security Engineer')
// → '(current_job_title:"Security Engineer"# OR job_title:"Security Engineer"#)'
function termFields(fields: string[], value?: string) {
  const v = esc(value)
  if (!v) return ''
  return `(${fields.map((f) => `${f}:"${v}"#`).join(' OR ')})`
}

// Build a phrase OR token‑AND clause across multiple fields. If both a phrase and
// token clause exist they are combined with OR.
function phraseOrTokens(fields: string[], value?: string) {
  const p = termFields(fields, value)
  const t = tokensANDFields(fields, value)
  if (p && t) return `(${p} OR ${t})`
  return p || t
}

// Build a clause that matches any of the provided values across multiple
// fields. Each value becomes a phrase (quoted) and values are OR'd together.
// Example: anyValuesFields(['skill','keyword'], ['CCTV','Service'])
// → '(skill:"CCTV"# OR keyword:"CCTV"# OR skill:"Service"# OR keyword:"Service"#)'
function anyValuesFields(fields: string[], items: string[]) {
  const list = (items || []).map(esc).filter(Boolean)
  if (!list.length) return ''
  const bits: string[] = []
  for (const f of fields) {
    for (const v of list) {
      bits.push(`${f}:"${v}"#`)
    }
  }
  return `(${bits.join(' OR ')})`
}

// Generate alternative job titles based on a given title. Strips common
// seniority qualifiers and adds a few domain‑specific synonyms when applicable.
function altTitlesFrom(title?: string) {
  const v = (title || '').trim()
  const out = new Set<string>()
  if (!v) return [] as string[]
  out.add(v)
  // Remove common seniority qualifiers like Senior, Lead, Principal, etc.
  const stripped = v
    .replace(/\b(Senior|Lead|Principal|Junior|Mid|Midweight|Head|Director)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped && stripped !== v) out.add(stripped)
  // If the title contains security & engineer, add some common synonyms.
  if (/security/i.test(v) && /engineer/i.test(v)) {
    ;[
      'Security Systems Engineer',
      'Fire & Security Engineer',
      'Security Service Engineer',
      'Security Installation Engineer',
      'CCTV Engineer',
      'Access Control Engineer',
    ].forEach((syn) => out.add(syn))
  }
  return Array.from(out)
}

// Build a clause for the job title using exact phrases for all alternatives
// plus a token AND clause across job title fields. This ensures that titles
// containing all tokens (e.g. "Fire & Security Engineer") will match.
function buildTitleClause(title?: string) {
  const fields = ['current_job_title', 'job_title']
  const alts = altTitlesFrom(title)
  const phraseClauses = alts
    .map((t) => termFields(fields, t))
    .filter(Boolean)
  const tokenClause = tokensANDFields(fields, title)
  const clauses = [...phraseClauses]
  if (tokenClause) clauses.push(tokenClause)
  if (!clauses.length) return ''
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`
}

// Remove duplicate objects based on a given key extractor.
function onlyUnique<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of arr) {
    const k = key(it)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

// Find a LinkedIn URL from a candidate record. Checks several possible fields.
function findLinkedIn(d: any): string | null {
  const cands = [
    d.linkedin,
    d.linkedIn,
    d.linkedin_url,
    d.linkedinUrl,
    d.social?.linkedin,
    d.social_links?.linkedin,
    d.urls?.linkedin,
    d.contacts?.linkedin,
  ].filter(Boolean)
  for (const v of cands) {
    if (typeof v === 'string' && v.includes('linkedin.com')) return v
  }
  const arrays = [d.websites, d.links, d.social, d.social_links].filter(Array.isArray)
  for (const arr of arrays as any[]) {
    const hit =
      arr.find((x: any) => typeof x === 'string' && x.includes('linkedin.com')) ||
      arr.find((x: any) => typeof x?.url === 'string' && x.url.includes('linkedin.com'))
    if (hit) return typeof hit === 'string' ? hit : hit.url
  }
  return null
}

// ----------------------------------------------------------------------------
// API route handler
//
export async function POST(req: NextRequest) {
  requiredEnv()
  const body = (await req.json().catch(() => ({}))) as RunReq
  const page = Math.max(1, Number(body.page ?? 1))
  const pageSize = Math.min(Math.max(Number(body.limit ?? 20), 1), 50)
  const debug = !!body.debug

  // Validate session & retrieve id token
  const session = await getSession()
  let idToken = session.tokens?.idToken
  if (!idToken) {
    return NextResponse.json({ error: 'Not authenticated with Vincere' }, { status: 401 })
  }

  // Build base URLs
  const base = config.VINCERE_TENANT_API_BASE.replace(/\/$/, '')
  const positionUrl = (id: string) => `${base}/api/v2/position/${encodeURIComponent(id)}`
  const searchBase = `${base}/api/v2/candidate/search`

  // Retrieve or resolve job details
  let job = body.job
  if (!job && body.jobId) {
    // Fetch job details from Vincere using jobId
    const call = async () =>
      fetch(positionUrl(body.jobId!), {
        headers: {
          'id-token': idToken!,
          'x-api-key': config.VINCERE_API_KEY,
        },
        cache: 'no-store',
      })
    let r = await call()
    // Refresh token if unauthorized
    if (r.status === 401 || r.status === 403) {
      if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
        const s2 = await getSession()
        idToken = s2.tokens?.idToken
        r = await call()
      }
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return NextResponse.json({ error: 'Failed to load position', detail }, { status: r.status || 400 })
    }
    const pos = await r.json().catch(() => ({}))
    job = {
      title: pos.job_title || pos.title || pos.name || '',
      location: pos['location-text'] || pos.location_text || pos.location || pos.city || '',
      skills: Array.isArray(pos.skills)
        ? pos.skills.map((s: any) => s?.name ?? s).filter(Boolean)
        : typeof pos.keywords === 'string'
          ? pos.keywords.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [],
      description: String(pos.public_description || pos.publicDescription || pos.description || ''),
    }
  }
  // If still no job, return error
  if (!job) {
    return NextResponse.json({ error: 'Missing job' }, { status: 400 })
  }

  const title = String(job.title || '').trim()
  const location = String(job.location || '').trim()
  const skills = Array.isArray(job.skills) ? job.skills.map(String) : []
  const qualifications = Array.isArray(job.qualifications) ? job.qualifications.map(String) : []
  const description = String(job.description || '')
  if (!title) {
    return NextResponse.json({ error: 'Missing job title' }, { status: 400 })
  }

  // Build clauses for each part of the query
  const titleClause = buildTitleClause(title)
  const locationClause = phraseOrTokens(
    [
      'current_location_name',
      'current_city',
      'current_address',
      'current_state',
      'current_country_code',
      'current_postal_code',
    ],
    location,
  )
  // Pick up to three skills
  const top3Skills = skills.slice(0, 3)
  const skillsClause = anyValuesFields(['skill', 'keyword'], top3Skills)

  // Define the three search strategies in order of strictness
  const strategies: { label: string; q: string }[] = [
    // Strategy 1: title AND location AND top 3 skills
    { label: 'S1', q: [titleClause, locationClause, skillsClause].filter(Boolean).join(' AND ') },
    // Strategy 2: title AND location (no skills)
    { label: 'S2', q: [titleClause, locationClause].filter(Boolean).join(' AND ') },
    // Strategy 3: title only
    { label: 'S3', q: titleClause },
  ].map((s) => ({ ...s, q: s.q || '*:*' }))

  // Prepare matrix vars: choose fields to return and sort order
  const fieldsToReturn = [
    'id',
    'candidate_id',
    'first_name',
    'last_name',
    'current_job_title',
    'current_location_name',
    'skill',
    'keyword',
    'linkedin_url',
  ].join(',')

  // Helper to fetch with retry when idToken is expired
  const headersBase = () => ({ 'id-token': idToken!, 'x-api-key': config.VINCERE_API_KEY })
  const fetchWithRetry = async (url: string) => {
    let resp = await fetch(url, { headers: headersBase(), cache: 'no-store' })
    if (resp.status === 401 || resp.status === 403) {
      if (await refreshIdToken(session.user?.email || session.sessionId || '')) {
        const s2 = await getSession()
        idToken = s2.tokens?.idToken
        resp = await fetch(url, { headers: headersBase(), cache: 'no-store' })
      }
    }
    return resp
  }

  // Run each strategy, collect and deduplicate candidates
  const allDocs: any[] = []
  const dbg: any[] = []
  for (const strat of strategies) {
    const matrix = `;fl=${encodeURIComponent(fieldsToReturn)};sort=${encodeURIComponent('created_date desc')}`
    const limit = Math.min(Math.max(pageSize, 1), 50)
    const url = `${searchBase}/${matrix}?q=${encodeURIComponent(strat.q)}&limit=${limit}`
    const resp = await fetchWithRetry(url)
    let docs: any[] = []
    let errorText = ''
    if (resp.ok) {
      const json = await resp.json().catch(() => ({}))
      docs = json?.response?.docs || json?.data || []
      allDocs.push(...docs)
    } else {
      errorText = await resp.text().catch(() => '')
    }
    // Log to server console
    console.log(
      '[match.run]',
      strat.label,
      'q=',
      strat.q,
      'status=',
      resp.status,
      'count=',
      docs.length,
      errorText ? `error=${errorText.slice(0, 200)}` : '',
    )
    if (debug) {
      dbg.push({
        label: strat.label,
        q: strat.q,
        status: resp.status,
        count: docs.length,
        sampleId: docs[0]?.id ?? docs[0]?.candidate_id ?? null,
        error: errorText,
      })
    }
  }

  // De‑duplicate candidates by id/candidate_id
  const dedupDocs = onlyUnique(allDocs, (d: any) => String(d.id ?? d.candidate_id ?? ''))

  // Map to simplified candidate objects. Include skills/keywords if available.
  const candidates = dedupDocs
    .map((d: any) => {
      const id = String(d.id ?? d.candidate_id ?? '')
      if (!id) return null
      const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || (d.full_name ?? '')
      const location = d.current_location_name || d.current_location || d.location || ''
      // Skills: combine skill and keyword fields if present
      const rawSkills = []
      if (Array.isArray(d.skill)) rawSkills.push(...d.skill)
      else if (typeof d.skill === 'string') rawSkills.push(d.skill)
      if (Array.isArray(d.keyword)) rawSkills.push(...d.keyword)
      else if (typeof d.keyword === 'string') rawSkills.push(d.keyword)
      const skillsList = rawSkills.filter(Boolean)
      const linkedin = findLinkedIn(d)
      return { id, name, location, skills: skillsList, linkedin }
    })
    .filter(Boolean) as {
    id: string
    name: string
    location: string
    skills: string[]
    linkedin: string | null
  }[]

  // Send to AI scoring endpoint
  const aiResp = await fetch(new URL('/api/ai/analyze', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job: { title, location, skills, qualifications, description },
      candidates: candidates.map((c) => ({ id: c.id, name: c.name, location: c.location, skills: c.skills })),
    }),
  })
  const aiJson = await aiResp.json().catch(() => ({}))
  // Extract scores into a map
  const aiList: any[] = Array.isArray(aiJson?.results)
    ? aiJson.results
    : Array.isArray(aiJson)
    ? aiJson
    : aiJson?.data || []
  const scoreById = new Map<string, { score: number; reason: string }>()
  for (const r of aiList) {
    const cid = String(r.candidate_id ?? r.id ?? r.candidateId ?? '')
    if (!cid) continue
    scoreById.set(cid, { score: Number(r.score ?? 0), reason: String(r.reason ?? '') })
  }
  // Attach scores to candidates and sort descending
  const scored = candidates
    .map((c) => ({
      candidateId: c.id,
      candidateName: c.name,
      linkedin: c.linkedin,
      score: scoreById.get(c.id)?.score ?? 0,
      reason: scoreById.get(c.id)?.reason ?? '',
    }))
    .sort((a, b) => b.score - a.score)

  // Apply pagination on the scored list
  const total = scored.length
  const pageSizeClamped = Math.max(1, Math.min(pageSize, 50))
  const start = (page - 1) * pageSizeClamped
  const results = start < total ? scored.slice(start, start + pageSizeClamped) : []

  return NextResponse.json({
    results,
    total,
    page,
    pageSize: pageSizeClamped,
    ...(debug ? { debug: dbg } : {}),
  })
}

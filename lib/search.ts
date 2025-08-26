// lib/search.ts
function escHash(s: string) {
  return s.replace(/#/g, '.08')
}

export function fqClause(field: string, value?: string) {
  if (!value) return ''
  return `fq=${encodeURIComponent(`${field}:${escHash(value)}#`)}`
}

export function qClause(q?: string) {
  if (!q) return ''
  return `q=${encodeURIComponent(`${escHash(q)}#`)}`
}

export function radiusClause(lat?: number, lng?: number, km?: number) {
  if (lat == null || lng == null) return ''
  const d = km || 50
  // location_radius uses d, unit, lat & lng
  return `fq=${encodeURIComponent(`location_radius:d=${d},unit=km,lat=${lat},lng=${lng}#`)}`
}

export type CandidateSearchInput = {
  jobTitle?: string
  locationText?: string
  industryIds?: number[]
  skills?: string[]
  qualifications?: string[]
  coords?: { lat: number; lng: number } | null
  limit?: number
  start?: number
}

export function buildCandidateSearchUrl(
  base: string,
  input: CandidateSearchInput,
) {
  // use correct field list and sort order
  const u = new URL(
    base.replace(/\/$/, '') +
      '/api/v2/candidate/search/fl=id,first_name,last_name,current_location_name,current_job_title,skill,keyword,linkedin_url;sort=created_date desc',
  )
  const parts: string[] = []

  // radius search overrides text location
  if (input.coords) {
    parts.push(radiusClause(input.coords.lat, input.coords.lng, 50))
  } else if (input.locationText) {
    // current_location_name is the correct location field for candidates
    parts.push(fqClause('current_location_name', input.locationText))
  }

  // skills/keywords: use singular fields ‘skill’ and ‘keyword’
  if (input.skills && input.skills.length) {
    const clauses: string[] = []
    for (const s of input.skills) {
      const v = s.trim()
      if (!v) continue
      clauses.push(`skill:"${v}"`)
      clauses.push(`keyword:"${v}"`)
    }
    if (clauses.length) {
      // join with OR; you can change to AND if you want all skills to be required
      parts.push(qClause(clauses.join(' OR ')))
    }
  }

  // job title: use current_job_title and job_title (work history) fields
  if (input.jobTitle) {
    const t = input.jobTitle.trim()
    if (t) {
      parts.push(
        qClause(
          `current_job_title:"${t}" OR job_title:"${t}" OR current_title:"${t}"`,
        ),
      )
    }
  }

  // industry ids: Vincere uses industry_id (not industryId)
  if (input.industryIds && input.industryIds.length) {
    const ids = input.industryIds.map((i) => `industry_id:${i}`).join(' AND ')
    parts.push(fqClause(ids))
  }

  // qualifications: there is no dedicated field, so search advanced text
  if (input.qualifications && input.qualifications.length) {
    const clauses = input.qualifications
      .map((q) => q.trim())
      .filter(Boolean)
      .map((v) => `advanced_text:"${v}"`)
    if (clauses.length) {
      parts.push(qClause(clauses.join(' OR ')))
    }
  }

  // append all query parts to URL
  for (const p of parts) {
    if (!p) continue
    const [k, v] = p.split('=')
    u.searchParams.append(k, decodeURIComponent(v))
  }
  u.searchParams.set('start', String(input.start ?? 0))
  u.searchParams.set('limit', String(input.limit ?? 50))

  return u.toString()
}

function escHash(s: string) {
  return s.replace(/#/g, '.08')
}
export function fqClause(field: string, value: string) {
  if (!value) return ''
  return `fq=${encodeURIComponent(field + ':' + escHash(value) + '#')}`
}
export function qClause(q: string) {
  if (!q) return ''
  return `q=${encodeURIComponent(escHash(q) + '#')}`
}
export function radiusClause(lat?: number, lng?: number, km?: number) {
  if (lat == null || lng == null) return ''
  const d = km || 50
  return `fq=${encodeURIComponent(`location_radius:d=${d},unit=km,lat=${lat},lng=${lng}#`)}`
}

export type CandidateSearchInput = {
  jobTitle?: string
  locationText?: string
  industryIds?: number[]
  skills?: string[]
  qualifications?: string[]
  coords?: { lat: number, lng: number } | null
  limit?: number
  start?: number
}

export function buildCandidateSearchUrl(base: string, input: CandidateSearchInput) {
  const u = new URL(base.replace(/\/$/, '') + '/api/v2/candidate/search/fl=id,first_name,last_name,current_location,skills;sort=created_date desc')
  const parts: string[] = []

  // Priority: location radius (if coords) -> skills -> job title -> industry -> qualifications
  if (input.coords) {
    parts.push(radiusClause(input.coords.lat, input.coords.lng, 50))
  } else if (input.locationText) {
    parts.push(fqClause('current_location', `"${input.locationText}"`))
  }
  if (input.skills && input.skills.length) {
    const skillQuery = input.skills.map(s => `skills:${s}`).join(' AND ')
    parts.push(qClause(skillQuery))
  }
  if (input.jobTitle) {
    // Exact phrase preference
    parts.push(qClause(`text:"${input.jobTitle}"`))
  }
  if (input.industryIds && input.industryIds.length) {
    const iq = input.industryIds.map(i => `industryid:${i}`).join(' AND ')
    parts.push(fqClause('', iq)) // will become just "fq=<...>"
  }
  if (input.qualifications && input.qualifications.length) {
    const qq = input.qualifications.map(q => `text:${q}`).join(' AND ')
    parts.push(qClause(qq))
  }

  // Add to URL
  for (const p of parts) {
    if (!p) continue
    const [k, v] = p.split('=')
    u.searchParams.append(k, decodeURIComponent(v))
  }
  u.searchParams.set('start', String(input.start ?? 0))
  u.searchParams.set('limit', String(input.limit ?? 50))
  return u.toString()
}

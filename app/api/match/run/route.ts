// Parse Vincere response (supports {result:{items,total}} and legacy shapes)
let json: any = {}
try { json = JSON.parse(text) } catch { json = {} }

const result = json?.result

const rawItems = Array.isArray(result?.items)
  ? result.items
  : Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.items)
      ? json.items
      : []

const count = Number(
  result?.total ??
  json?.count ??
  json?.total ??
  rawItems.length ??
  0
)

// helpers to flatten arrays of strings/option objects
const toList = (v: any) =>
  Array.isArray(v)
    ? v.map((x) => typeof x === 'string' ? x : (x?.description ?? x?.value ?? ''))
        .filter(Boolean)
    : []

// Map to the shape the UI expects
const results = rawItems.map((c: any) => {
  const first = c?.first_name ?? c?.firstName ?? ''
  const last  = c?.last_name ?? c?.lastName ?? ''
  const full  = (c?.name || `${first} ${last}`).trim()
  const title = c?.current_job_title ?? c?.title ?? ''
  const location = c?.current_location_name ?? c?.location ?? ''
  const city = c?.current_city ?? ''

  const skills = toList(c?.skill)
  const quals = [
    ...toList(c?.edu_qualification),
    ...toList(c?.edu_degree),
    ...toList(c?.edu_course),
    ...toList(c?.edu_institution),
    ...toList(c?.edu_training),
  ]

  return {
    id: String(c?.id ?? ''),
    firstName: first,
    lastName: last,
    fullName: full,
    title,
    location,
    city,
    skills,
    qualifications: quals,
    linkedin: c?.linkedin ?? null,
  }
})

return NextResponse.json({
  ok: true,
  query: { matrix_vars: matrixVars, q: qRaw, url, start, limit },
  count,
  results,
  candidates: results, // alias
})

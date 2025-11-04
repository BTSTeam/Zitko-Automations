// --- Company type (with org details) ---
type Company = {
  id: string
  name: string | null
  website_url: string | null
  linkedin_url: string | null
  exact_location?: string | null
  city?: string | null
  state?: string | null
  short_description?: string | null
  job_postings?: any[]
  hiring_people?: any[]
  news_articles?: any[]
}

// --- Helper to nicely format city/state display ---
function formatCityState(c: Company) {
  const city = (c.city || '').trim()
  const state = (c.state || '').trim()
  if (city && state) return `${city}, ${state}`
  return city || state || null
}

// --- Company Results Section ---
{companies.length > 0 ? (
  <ul className="divide-y divide-gray-200">
    {companies.map((c) => (
      <li key={c.id} className="p-4">
        {/* --- Row 1: Company name + City, State --- */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-base truncate">
              {c.name || '—'}
            </span>

            {/* City + State next to name */}
            {formatCityState(c) ? (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-xs text-gray-600 truncate">
                  {formatCityState(c)}
                </span>
              </>
            ) : null}
          </div>

          {/* --- Right-side icons --- */}
          <div className="shrink-0 flex items-center gap-3">
            {/* LinkedIn */}
            <a
              href={c.linkedin_url || undefined}
              target={c.linkedin_url ? '_blank' : undefined}
              rel={c.linkedin_url ? 'noreferrer' : undefined}
              className={
                c.linkedin_url
                  ? 'text-gray-700 hover:text-gray-900'
                  : 'opacity-30 pointer-events-none cursor-default'
              }
              title={c.linkedin_url ? 'Open LinkedIn' : 'LinkedIn not available'}
            >
              <IconLinkedIn />
            </a>

            {/* Website */}
            <a
              href={c.website_url || undefined}
              target={c.website_url ? '_blank' : undefined}
              rel={c.website_url ? 'noreferrer' : undefined}
              className={
                c.website_url
                  ? 'text-gray-700 hover:text-gray-900'
                  : 'opacity-30 pointer-events-none cursor-default'
              }
              title={c.website_url ? 'Open company website' : 'Company website not available'}
            >
              <IconGlobe muted={!c.website_url} />
            </a>
          </div>
        </div>

        {/* --- Row 2: short_description (replaces employees) --- */}
        <div className="mt-1 text-sm text-gray-700">
          {c.short_description || '—'}
        </div>

        {/* --- Dropdown panels for extra data --- */}
        {c.job_postings?.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer font-medium text-sm text-orange-600">
              Job Postings ({c.job_postings.length})
            </summary>
            <ul className="mt-1 ml-3 list-disc text-sm text-gray-600">
              {c.job_postings.map((job) => (
                <li key={job.id}>
                  {job.title || 'Untitled Job'}{' '}
                  {job.location && (
                    <span className="text-xs text-gray-500">
                      ({job.location})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {c.hiring_people?.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer font-medium text-sm text-orange-600">
              Hiring / Recruitment Contacts ({c.hiring_people.length})
            </summary>
            <ul className="mt-1 ml-3 list-disc text-sm text-gray-600">
              {c.hiring_people.map((p) => (
                <li key={p.id}>
                  {p.name}
                  {p.title ? ` – ${p.title}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}

        {c.news_articles?.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer font-medium text-sm text-orange-600">
              News Articles ({c.news_articles.length})
            </summary>
            <ul className="mt-1 ml-3 list-disc text-sm text-gray-600">
              {c.news_articles.map((n) => (
                <li key={n.id}>
                  {n.title}{' '}
                  {n.url && (
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-600 hover:underline"
                    >
                      (view)
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </li>
    ))}
  </ul>
) : (
  <p className="text-sm text-gray-500 italic">No companies found.</p>
)}

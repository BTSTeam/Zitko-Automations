// app/dashboard/_source/SearchResults.tsx
'use client'

import { useMemo } from 'react'

type SourceMode = 'candidates' | 'companies'

/* ============================ Types ============================ */
export type CandidateResult = {
  id?: string
  name: string
  title?: string
  organization_name?: string
  linkedin_url?: string
  location?: string
  email?: string
  email_status?: string // "verified" expected from API route
  people_auto_score?: number
}

export type CompanyResult = {
  id?: string
  name: string
  website?: string
  linkedin_url?: string
  industry?: string
  location?: string
  employees?: number
  revenue?: number
  domain?: string
}

type Props = {
  mode: SourceMode
  results: Array<CandidateResult | CompanyResult>
  loading?: boolean
  title?: string
  subtitle?: string
}

/* ============================ UI Bits ============================ */

function Panel({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white shadow-sm">
      {(title || subtitle) && (
        <div className="border-b border-gray-100 px-5 py-4">
          {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
      )}
      <div className="p-0">{children}</div>
    </div>
  )
}

function EmptyState({ mode }: { mode: SourceMode }) {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <div className="mx-auto max-w-lg">
        <p className="text-base font-medium text-gray-900">
          {mode === 'candidates' ? 'No candidates found' : 'No companies found'}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Try adjusting your filters (titles, locations, keywords). For Contract searches, remember IR35 and “Pay Rate”
          are automatically applied; for Permanent they are excluded.
        </p>
      </div>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-12 items-center gap-3 px-5 py-4 animate-pulse">
          <div className="col-span-4 h-4 rounded bg-gray-100" />
          <div className="col-span-3 h-4 rounded bg-gray-100" />
          <div className="col-span-3 h-4 rounded bg-gray-100" />
          <div className="col-span-2 h-4 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  )
}

function Tag({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' }) {
  const tones =
    tone === 'green'
      ? 'bg-green-50 text-green-700 ring-green-600/20'
      : 'bg-slate-50 text-slate-700 ring-slate-600/20'
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${tones}`}>
      {children}
    </span>
  )
}

function ExtLink({
  href,
  children,
  className,
  'aria-label': ariaLabel,
}: {
  href?: string
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}) {
  if (!href) return <span className={className}>{children}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline decoration-gray-200 underline-offset-2 hover:decoration-gray-400 ${className ?? ''}`}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  )
}

/* ============================ Tables ============================ */

function CandidatesTable({ rows }: { rows: CandidateResult[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
          <tr>
            <th className="px-5 py-3">Name</th>
            <th className="px-3 py-3">Job Title</th>
            <th className="px-3 py-3">Company</th>
            <th className="px-3 py-3">Location</th>
            <th className="px-3 py-3">Email</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, idx) => {
            const verified = (r.email_status || '').toLowerCase() === 'verified'
            return (
              <tr key={`${r.id ?? r.linkedin_url ?? idx}`} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <div className="flex flex-col">
                    <ExtLink href={r.linkedin_url} aria-label={`Open ${r.name} on LinkedIn`} className="font-medium text-gray-900">
                      {r.name || '—'}
                    </ExtLink>
                    {typeof r.people_auto_score === 'number' && (
                      <span className="mt-0.5 text-xs text-gray-500">Score: {r.people_auto_score}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-gray-700">{r.title || '—'}</td>
                <td className="px-3 py-3 text-gray-700">{r.organization_name || '—'}</td>
                <td className="px-3 py-3 text-gray-700">{r.location || '—'}</td>
                <td className="px-3 py-3">
                  {r.email ? (
                    <div className="flex items-center gap-2">
                      <span className="truncate">{r.email}</span>
                      <Tag tone={verified ? 'green' : 'slate'}>{verified ? 'Verified' : 'Unverified'}</Tag>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CompaniesTable({ rows }: { rows: CompanyResult[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
          <tr>
            <th className="px-5 py-3">Company</th>
            <th className="px-3 py-3">Domain / Website</th>
            <th className="px-3 py-3">Industry</th>
            <th className="px-3 py-3">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, idx) => {
            const domain = (r.domain || '').toLowerCase()
            const displaySite = r.website || (domain ? `https://${domain}` : '')
            return (
              <tr key={`${r.id ?? r.domain ?? idx}`} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">{r.name || '—'}</span>
                    {r.linkedin_url && (
                      <ExtLink href={r.linkedin_url} className="text-xs text-gray-600" aria-label={`Open ${r.name} on LinkedIn`}>
                        LinkedIn
                      </ExtLink>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  {displaySite ? (
                    <ExtLink href={displaySite} aria-label={`Open ${r.name} website`}>
                      {domain || r.website}
                    </ExtLink>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-gray-700">{r.industry || '—'}</td>
                <td className="px-3 py-3 text-gray-700">{r.location || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ============================ Main ============================ */

export default function SearchResults({ mode, results, loading, title, subtitle }: Props) {
  const safeMode: SourceMode = mode === 'companies' ? 'companies' : 'candidates'

  const counts = useMemo(() => {
    return {
      total: results?.length ?? 0,
      verifiedEmails:
        safeMode === 'candidates'
          ? (results as CandidateResult[]).filter((r) => (r.email_status || '').toLowerCase() === 'verified').length
          : undefined,
    }
  }, [results, safeMode])

  return (
    <Panel
      title={title ?? (safeMode === 'candidates' ? 'Candidate Results' : 'Company Results')}
      subtitle={
        subtitle ??
        (safeMode === 'candidates'
          ? `Showing ${counts.total} candidate${counts.total === 1 ? '' : 's'}${typeof counts.verifiedEmails === 'number' ? ` • ${counts.verifiedEmails} verified emails` : ''}`
          : `Showing ${counts.total} compan${counts.total === 1 ? 'y' : 'ies'}`)
      }
    >
      {loading ? (
        <LoadingRows />
      ) : !results || results.length === 0 ? (
        <EmptyState mode={safeMode} />
      ) : safeMode === 'candidates' ? (
        <CandidatesTable rows={results as CandidateResult[]} />
      ) : (
        <CompaniesTable rows={results as CompanyResult[]} />
      )}
    </Panel>
  )
}

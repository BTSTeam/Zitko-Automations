// app/dashboard/_source/SourceTab.tsx
'use client'

import { useState } from 'react'
import SearchResults, {
  CandidateResult,
  CompanyResult,
} from './SearchResults'

type SourceMode = 'candidates' | 'companies'
type EmpType = 'permanent' | 'contract'

type Props = {
  /** Optional initial mode to support <SourceTab mode={...} /> */
  mode?: SourceMode
}

export default function SourceTab({ mode: initialMode = 'candidates' }: Props) {
  /* ============================ State ============================ */
  const [mode, setMode] = useState<SourceMode>(initialMode)
  const [empType, setEmpType] = useState<EmpType>('permanent')
  const [jobTitle, setJobTitle] = useState('')
  const [locations, setLocations] = useState('')
  const [keywords, setKeywords] = useState('')

  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<(CandidateResult | CompanyResult)[]>([])

  /* ============================ Helpers ============================ */

  async function handleSearch() {
    try {
      setLoading(true)
      setResults([])

      const titles = jobTitle
        ? jobTitle.split(',').map((t) => t.trim()).filter(Boolean)
        : []
      const locs = locations
        ? locations.split(',').map((l) => l.trim()).filter(Boolean)
        : []
      const keys = keywords
        ? keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : []

      const body = {
        titles,
        locations: locs,
        keywords: keys,
        permanent: empType === 'permanent',
        limit: 50,
      }

      const endpoint =
        mode === 'candidates'
          ? '/api/sourcing/people'
          : '/api/sourcing/companies'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Search failed')
      setResults(json.results || [])
    } catch (err) {
      console.error(err)
      alert('Search failed. See console for details.')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setJobTitle('')
    setLocations('')
    setKeywords('')
    setResults([])
  }

  /* ============================ UI ============================ */

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('candidates')}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            mode === 'candidates'
              ? 'bg-[#F7941D] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Candidates
        </button>
        <button
          onClick={() => setMode('companies')}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            mode === 'companies'
              ? 'bg-[#F7941D] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Companies
        </button>
      </div>

      {/* Search Fields */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'candidates' ? 'Candidate Search' : 'Company Search'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Enter filters below to search Apollo data
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Employment Type */}
          {mode === 'candidates' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
              <label className="text-sm font-medium text-gray-700">
                Employment Type:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setEmpType('permanent')}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${
                    empType === 'permanent'
                      ? 'bg-[#F7941D] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Permanent
                </button>
                <button
                  onClick={() => setEmpType('contract')}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${
                    empType === 'contract'
                      ? 'bg-[#F7941D] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Contract
                </button>
              </div>
            </div>
          )}

          {/* Job Title / Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {mode === 'candidates' ? 'Job Title' : 'Company Name'}
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={
                mode === 'candidates'
                  ? 'e.g. Fire Engineer, Security Manager'
                  : 'e.g. Johnson Controls, Chubb Fire'
              }
              className="mt-1 w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-[#F7941D] focus:ring-[#F7941D]"
            />
          </div>

          {/* Locations */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Locations
            </label>
            <input
              type="text"
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
              placeholder="e.g. London, Manchester"
              className="mt-1 w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-[#F7941D] focus:ring-[#F7941D]"
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. CCTV, Access Control, Fire Alarm"
              className="mt-1 w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-[#F7941D] focus:ring-[#F7941D]"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={handleReset}
              disabled={loading}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="rounded-md bg-[#F7941D] px-4 py-2 text-sm font-medium text-white hover:bg-[#e5830c] disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      {/* Results Panel */}
      <SearchResults
        mode={mode}
        results={results}
        loading={loading}
        title={
          mode === 'candidates'
            ? 'Candidate Search Results'
            : 'Company Search Results'
        }
      />
    </div>
  )
}

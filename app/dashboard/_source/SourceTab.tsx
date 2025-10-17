'use client'

import { useState } from 'react'
import SourcingForm from './SourcingForm'
import SearchResults from './SearchResults'

type SourceMode = 'candidates' | 'companies'

/**
 * Renders the sourcing page for the chosen mode (candidates or companies).
 * The page is split into a collapsible filter panel and a results panel.
 *
 * After performing a search, the filter panel collapses automatically.
 * Users can click "Show Filters" to re-expand the filter panel.
 */
export default function SourceTab({ mode }: { mode: SourceMode }) {
  // Holds the list of search results returned from the API
  const [results, setResults] = useState<any[]>([])
  // Controls whether we show a loading indicator in the results panel
  const [loading, setLoading] = useState(false)
  // Determines if the search panel is collapsed or expanded
  const [collapsed, setCollapsed] = useState(false)

  /**
   * Called when the user submits the search form.
   * Delegates to the correct API endpoint depending on mode,
   * stores the results, and collapses the filter panel.
   */
  async function handleSearch(formBody: any) {
    setLoading(true)
    try {
      // limit results to 50 per the requirements
      const body = { ...formBody, limit: 50 }
      const endpoint =
        mode === 'candidates' ? '/api/sourcing/people' : '/api/sourcing/companies'

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await resp.json()
      // fall back gracefully if the API uses a different results key
      const found = json?.results ?? json?.people ?? json?.companies ?? []
      setResults(found)
      // collapse the filter panel after search
      setCollapsed(true)
    } catch (error) {
      console.error('Error during search:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-6 flex flex-col gap-4">
      {/* Search/filter panel */}
      <div className={`transition-all ${collapsed ? 'max-h-12 overflow-hidden' : 'max-h-full'}`}>
        {collapsed ? (
          // When collapsed, show a button to re-open the filters
          <div className="flex justify-end mb-2">
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setCollapsed(false)}
            >
              Show Filters
            </button>
          </div>
        ) : (
          // When expanded, render the sourcing form
          <SourcingForm mode={mode} onSearch={handleSearch} />
        )}
      </div>

      {/* Results panel */}
      <SearchResults mode={mode} results={results} loading={loading} />
    </div>
  )
}

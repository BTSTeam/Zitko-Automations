'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

// lazy-load each tab as client components
const MatchTab  = dynamic(() => import('./_match/MatchTab'),   { ssr: false })
const SourceTab = dynamic(() => import('./_source/SourceTab'), { ssr: false })
const CvTab     = dynamic(() => import('./_cv/CvTab'),         { ssr: false })

type TabKey = 'match' | 'source' | 'cv'

export default function ClientShell(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('match')
  const [sourceMode, setSourceMode] = useState<'candidates' | 'companies'>('candidates')

  return (
    <div className="grid gap-6">
      {/* Tabs header */}
      <div className="card p-2">
        <div className="grid sm:grid-cols-3 gap-2">
          <button
            className={`btn w-full ${tab === 'match' ? 'btn-brand' : 'btn-grey'}`}
            onClick={() => setTab('match')}
            title="Candidate Matching"
          >
            Matching
          </button>
          <button
            className={`btn w-full ${tab === 'source' ? 'btn-brand' : 'btn-grey'}`}
            onClick={() => setTab('source')}
            title="Candidate Sourcing"
          >
            Sourcing
          </button>
          <button
            className={`btn w-full ${tab === 'cv' ? 'btn-brand' : 'btn-grey'}`}
            onClick={() => setTab('cv')}
            title="CV Formatting"
          >
            CV Formatting
          </button>
        </div>

        {/* Optional sourcing mode toggle if you use companies vs candidates */}
        {tab === 'source' && (
          <div className="flex gap-2 mt-3 justify-center">
            <button
              className={`btn ${sourceMode === 'candidates' ? 'btn-brand' : 'btn-grey'}`}
              onClick={() => setSourceMode('candidates')}
            >
              Candidates
            </button>
            <button
              className={`btn ${sourceMode === 'companies' ? 'btn-brand' : 'btn-grey'}`}
              onClick={() => setSourceMode('companies')}
            >
              Companies
            </button>
          </div>
        )}
      </div>

      {/* Active tab */}
      {tab === 'match' && <MatchTab />}
      {tab === 'source' && <SourceTab mode={sourceMode} />}
      {tab === 'cv' && <CvTab />}
    </div>
  )
}

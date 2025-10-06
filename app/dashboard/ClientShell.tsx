'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const MatchTab  = dynamic(() => import('./_match/MatchTab'),   { ssr: false })
const SourceTab = dynamic(() => import('./_source/SourceTab'), { ssr: false })
const CvTab     = dynamic(() => import('./_cv/CvTab'),         { ssr: false })
const ActiveCampaignTab = dynamic(() => import('./_ac/ActiveCampaignTab'), { ssr: false })

type TabKey = 'welcome' | 'match' | 'source' | 'cv' | 'ac'
type SourceMode = 'candidates' | 'companies'
type CvTemplate = 'standard' | 'sales'

function WelcomeCard() {
  return (
    <div className="card p-10 md:p-14">
      <div className="w-full grid place-items-center text-center py-10">
        <h1 className="text-5xl md:text-6xl tracking-[0.25em] font-semibold text-gray-800 mb-4">
          W E L C O M E
        </h1>
        <div className="text-brand-orange font-semibold tracking-wider mb-6">
          &gt; ALPHA TEST &lt;
        </div>
        <p className="text-gray-400">
          Please utilise the tabs above to navigate this app.
        </p>
      </div>
    </div>
  )
}

export default function ClientShell(): JSX.Element {
  // default to the welcome view instead of Candidate Matching
  const [tab, setTab] = useState<TabKey>('welcome')

  // sourcing dropdown
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState<SourceMode>('candidates')

  // cv dropdown
  const [cvOpen, setCvOpen] = useState(false)
  const [cvTemplate, setCvTemplate] = useState<CvTemplate>('standard')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest?.('[data-sourcing-root]')) setSourceOpen(false)
      if (!t.closest?.('[data-cv-root]')) setCvOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <div className="grid gap-6">
      {/* Top bar: left group (three tabs), right-aligned Active Campaign */}
      <div className="flex items-center justify-between mb-6">
        {/* Left cluster */}
        <div className="flex gap-2">
          {/* Match */}
          <button
            onClick={() => setTab('match')}
            className={`tab ${tab === 'match' ? 'tab-active' : ''}`}
          >
            Candidate Matching
          </button>

          {/* Sourcing dropdown */}
          <div className="relative" data-sourcing-root>
            <button
              onClick={() => { setSourceOpen(v => !v); setTab('source') }}
              className={`tab ${tab === 'source' ? 'tab-active' : ''}`}
              title="Sourcing"
            >
              Sourcing
            </button>

            {sourceOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${sourceMode==='candidates' ? 'font-medium' : ''}`}
                  onClick={() => { setSourceMode('candidates'); setTab('source'); setSourceOpen(false) }}
                >
                  Candidates
                </button>
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${sourceMode==='companies' ? 'font-medium' : ''}`}
                  onClick={() => { setSourceMode('companies'); setTab('source'); setSourceOpen(false) }}
                >
                  Companies
                </button>
              </div>
            )}
          </div>

          {/* CV Formatting dropdown */}
          <div className="relative" data-cv-root>
            <button
              onClick={() => { setCvOpen(v => !v); setTab('cv') }}
              className={`tab ${tab === 'cv' ? 'tab-active' : ''}`}
              title="CV Formatting"
            >
              CV Formatting
            </button>

            {cvOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${cvTemplate==='standard' ? 'font-medium' : ''}`}
                  onClick={() => { setCvTemplate('standard'); setTab('cv'); setCvOpen(false) }}
                >
                  Standard
                </button>
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${cvTemplate==='sales' ? 'font-medium' : ''}`}
                  onClick={() => { setCvTemplate('sales'); setTab('cv'); setCvOpen(false) }}
                >
                  Sales
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right-aligned single button (Active Campaign) */}
        <div>
          <button
            onClick={() => setTab('ac')}
            title="Active Campaign"
            aria-selected={tab === 'ac'}
            className={`tab ${tab === 'ac' ? '!bg-[#001961] !text-white !border-transparent hover:opacity-95 shadow-sm' : ''}`}
          >
            Active Campaign
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === 'welcome' && <WelcomeCard />}

      {tab === 'match' && <MatchTab />}

      {tab === 'source' && <SourceTab mode={sourceMode} />}

      {tab === 'cv' && <CvTab templateFromShell={cvTemplate} />}

      {tab === 'ac' && <ActiveCampaignTab />}
    </div>
  )
}

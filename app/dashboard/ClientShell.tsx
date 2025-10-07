'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const MatchTab  = dynamic(() => import('./_match/MatchTab'),   { ssr: false })
const SourceTab = dynamic(() => import('./_source/SourceTab'), { ssr: false })
const CvTab     = dynamic(() => import('./_cv/CvTab'),         { ssr: false })
const ActiveCampaignTab = dynamic(() => import('./_ac/ActiveCampaignTab'), { ssr: false })

type TabKey = 'match' | 'source' | 'cv' | 'ac'
type SourceMode = 'candidates' | 'companies'
type CvTemplate = 'standard' | 'sales'

export default function ClientShell(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('match')

  // show welcome until a tab is actively chosen
  const [showWelcome, setShowWelcome] = useState<boolean>(true)

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

  // central welcome block
  const WelcomeBlock = () => (
    <section className="min-h-[50vh] grid place-items-center px-6">
      <div className="text-center select-none">
        {/* W E L C O M E */}
        <h1
          className="font-semibold uppercase"
          style={{
            color: '#3B3E44',         // Zitko dark gray
            letterSpacing: '0.5em',
            fontSize: 'clamp(2.25rem, 6vw, 6rem)',
          }}
        >
          WELCOME
        </h1>

        {/* > ALPHA TEST < */}
        <p
          className="mt-3 font-semibold uppercase"
          style={{
            color: '#F7941D',         // Zitko orange
            letterSpacing: '0.25em',
            fontSize: 'clamp(0.875rem, 2.2vw, 1.25rem)',
          }}
        >
          &gt; ALPHA TEST &lt;
        </p>

        {/* helper text */}
        <p
          className="mt-4"
          style={{
            color: '#9CA3AF',         // light gray
            fontSize: 'clamp(0.8rem, 1.8vw, 1rem)',
          }}
        >
          Please utilise the tabs above to navigate the app
        </p>
      </div>
    </section>
  )

  return (
    <div className="grid gap-6">
      {/* Top bar: left group (three tabs), right-aligned Active Campaign */}
      <div className="flex items-center justify-between mb-6">
        {/* Left cluster */}
        <div className="flex gap-2">
          {/* Match */}
          <button
            onClick={() => { setTab('match'); setShowWelcome(false) }}
            className={`tab ${tab === 'match' ? 'tab-active' : ''}`}
          >
            Candidate Matching
          </button>

          {/* Sourcing dropdown */}
          <div className="relative" data-sourcing-root>
            <button
              onClick={() => setSourceOpen(v => !v)}
              className={`tab ${tab === 'source' ? 'tab-active' : ''}`}
              title="Sourcing"
            >
              Sourcing
            </button>

            {sourceOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${sourceMode==='candidates' ? 'font-medium' : ''}`}
                  onClick={() => { setSourceMode('candidates'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                >
                  Candidates
                </button>
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${sourceMode==='companies' ? 'font-medium' : ''}`}
                  onClick={() => { setSourceMode('companies'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                >
                  Companies
                </button>
              </div>
            )}
          </div>

          {/* CV Formatting dropdown */}
          <div className="relative" data-cv-root>
            <button
              onClick={() => setCvOpen(v => !v)}
              className={`tab ${tab === 'cv' ? 'tab-active' : ''}`}
              title="CV Formatting"
            >
              CV Formatting
            </button>

            {cvOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${cvTemplate==='standard' ? 'font-medium' : ''}`}
                  onClick={() => { setCvTemplate('standard'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                >
                  Standard
                </button>
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${cvTemplate==='sales' ? 'font-medium' : ''}`}
                  onClick={() => { setCvTemplate('sales'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
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
            onClick={() => { setTab('ac'); setShowWelcome(false) }}
            title="Active Campaign"
            aria-selected={tab === 'ac'}
            // Force our AC blue + white when active, ignore default tab-active style
            className={`tab ${tab === 'ac' ? '!bg-[#001961] !text-white !border-transparent hover:opacity-95 shadow-sm' : ''}`}
          >
            Active Campaign
          </button>
        </div>
      </div>

      {/* Content */}
      {showWelcome ? (
        <WelcomeBlock />
      ) : (
        <>
          {tab === 'match' && <MatchTab />}
          {tab === 'source' && <SourceTab mode={sourceMode} />}
          {tab === 'cv' && <CvTab templateFromShell={cvTemplate} />}
          {tab === 'ac' && <ActiveCampaignTab />}
        </>
      )}
    </div>
  )
}

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
  const [showWelcome, setShowWelcome] = useState<boolean>(true)

  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState<SourceMode>('candidates')

  const [cvOpen, setCvOpen] = useState(false)
  const [cvTemplate, setCvTemplate] = useState<CvTemplate>('standard')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = (e.target as HTMLElement)
      if (!t.closest?.('[data-sourcing-root]')) setSourceOpen(false)
      if (!t.closest?.('[data-cv-root]')) setCvOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const WelcomeBlock = () => (
    <section className="h-full grid place-items-center px-6">
      <div className="text-center select-none">
        <h1
          className="font-semibold uppercase"
          style={{ color: '#3B3E44', letterSpacing: '0.5em', fontSize: 'clamp(2.25rem, 6vw, 6rem)' }}
        >
          WELCOME
        </h1>
        <p
          className="mt-3 font-semibold uppercase"
          style={{ color: '#F7941D', letterSpacing: '0.25em', fontSize: 'clamp(0.875rem, 2.2vw, 1.25rem)' }}
        >
          &gt; ALPHA TEST &lt;
        </p>
        <p
          className="mt-4"
          style={{ color: '#9CA3AF', fontSize: 'clamp(0.8rem, 1.8vw, 1rem)' }}
        >
          Please utilise the tabs above to navigate the app
        </p>
      </div>
    </section>
  )

  const active = (k: TabKey) => (!showWelcome && tab === k ? 'tab-active' : '')

  return (
    <>
      {/* Make the whole area fill the viewport (minus your header). Adjust 120px if needed. */}
      <div className="flex flex-col gap-6 min-h-[calc(100vh-120px)]">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          {/* Left cluster */}
          <div className="flex gap-2">
            <button
              onClick={() => { setTab('match'); setShowWelcome(false) }}
              className={`tab ${active('match')}`}
            >
              Candidate Matching
            </button>

            {/* Sourcing dropdown */}
            <div className="relative" data-sourcing-root>
              <button
                onClick={() => setSourceOpen(v => !v)}
                className={`tab ${active('source')}`}
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
                className={`tab ${active('cv')}`}
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

          {/* Right-aligned Active Campaign */}
          <div>
            <button
              onClick={() => { setTab('ac'); setShowWelcome(false) }}
              title="Active Campaign"
              aria-selected={!showWelcome && tab === 'ac'}
              className={`tab ${!showWelcome && tab === 'ac' ? '!bg-[#001961] !text-white !border-transparent hover:opacity-95 shadow-sm' : ''}`}
            >
              Active Campaign
            </button>
          </div>
        </div>

        {/* Content area grows to fill height; welcome centers inside it */}
        <div className="flex-1">
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
      </div>
    </>
  )
}

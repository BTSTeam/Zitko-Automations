'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const MatchTab  = dynamic(() => import('./_match/MatchTab'),   { ssr: false })
const SourceTab = dynamic(() => import('./_source/SourceTab'), { ssr: false })
const CvTab     = dynamic(() => import('./_cv/CvTab'),         { ssr: false })
// NEW: Admin-only ActiveCampaign tab
const ActiveCampaignTab = dynamic(() => import('./_ac/ActiveCampaignTab'), { ssr: false })

type TabKey = 'match' | 'source' | 'cv' | 'ac'
type SourceMode = 'candidates' | 'companies'
type CvTemplate = 'standard' | 'sales'

export default function ClientShell(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('match')

  // sourcing dropdown
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState<SourceMode>('candidates')

  // cv dropdown
  const [cvOpen, setCvOpen] = useState(false)
  const [cvTemplate, setCvTemplate] = useState<CvTemplate>('standard')

  // NEW: role for admin-only AC tab
  const [role, setRole] = useState<string>('user')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest?.('[data-sourcing-root]')) setSourceOpen(false)
      if (!t.closest?.('[data-cv-root]')) setCvOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // NEW: fetch role so we can show the AC tab to admins only
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(me => setRole(me?.user?.role ?? 'user'))
      .catch(() => setRole('user'))
  }, [])

  return (
    <div className="grid gap-6">
      {/* Top Tabs: Match | Sourcing (dropdown) | CV Formatting (dropdown) | ActiveCampaign (admin) */}
      <div className="flex gap-2 mb-6 justify-center">
        {/* Match (simple button) */}
        <button
          onClick={() => setTab('match')}
          className={`tab ${tab === 'match' ? 'tab-active' : ''}`}
        >
          Candidate Matching
        </button>

        {/* Sourcing dropdown (no arrow, no tab switch until item chosen) */}
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

        {/* NEW: ActiveCampaign tab (admin only) */}
        {role === 'admin' && (
          <button
            onClick={() => setTab('ac')}
            className={`tab ${tab === 'ac' ? 'tab-active' : ''}`}
            title="ActiveCampaign"
          >
            ActiveCampaign
          </button>
        )}
      </div>

      {/* Active tab content */}
      {tab === 'match' && <MatchTab />}

      {tab === 'source' && <SourceTab mode={sourceMode} />}

      {tab === 'cv' && (
        // Pass the chosen template down; CvTab will render *without* its own picker when controlled
        <CvTab templateFromShell={cvTemplate} />
      )}

      {/* NEW: AC content (admin only) */}
      {tab === 'ac' && role === 'admin' && <ActiveCampaignTab />}
    </div>
  )
}

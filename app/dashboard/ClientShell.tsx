'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import each tab to prevent SSR on client-only code
const MatchTab = dynamic(() => import('./_match/MatchTab'), { ssr: false })
const SourceTab = dynamic(() => import('./_source/SourceTab'), { ssr: false })
const SocialMediaTab = dynamic(() => import('./_social/SocialMediaTab'), { ssr: false })
const ActiveCampaignUploadTab = dynamic(() => import('./_ac/ActiveCampaignTab'), { ssr: false })
const ActiveCampaignHtmlTab = dynamic(() => import('./_ac/ActiveCampaignHtmlTab'), { ssr: false })

// New: individual CV format modules
const CvUkTab = dynamic(() => import('./_cv/UkFormat'), { ssr: false })
const CvUsTab = dynamic(() => import('./_cv/UsFormat'), { ssr: false })
const CvSalesTab = dynamic(() => import('./_cv/SalesFormat'), { ssr: false })

type TabKey = 'match' | 'source' | 'cv' | 'social' | 'ac'
type SourceMode = 'candidates' | 'companies'
type CvTemplate = 'uk' | 'us' | 'sales'
type SocialMode = 'jobPosts' | 'generalPosts'

const DISABLE_SOURCING = false
const DISABLE_SOCIAL = true

export default function ClientShell(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('match')
  const [showWelcome, setShowWelcome] = useState(true)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState<SourceMode>('candidates')
  const [cvOpen, setCvOpen] = useState(false)
  const [cvTemplate, setCvTemplate] = useState<CvTemplate>('uk')
  const [socialOpen, setSocialOpen] = useState(false)
  const [socialMode, setSocialMode] = useState<SocialMode>('jobPosts')
  const [acOpen, setAcOpen] = useState(false)
  const [acMode, setAcMode] = useState<'upload' | 'html'>('upload')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest?.('[data-sourcing-root]')) setSourceOpen(false)
      if (!t.closest?.('[data-cv-root]')) setCvOpen(false)
      if (!t.closest?.('[data-social-root]')) setSocialOpen(false)
      if (!t.closest?.('[data-ac-root]')) setAcOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const WelcomeBlock = () => (
    <section className="h-full grid place-items-center px-6">
      <div className="text-center select-none">
        <h1
          className="font-semibold uppercase"
          style={{
            color: '#3B3E44',
            letterSpacing: '0.5em',
            fontSize: 'clamp(2.25rem, 6vw, 6rem)',
          }}
        >
          WELCOME
        </h1>
        <p
          className="mt-3 font-semibold uppercase"
          style={{
            color: '#F7941D',
            letterSpacing: '0.25em',
            fontSize: 'clamp(0.875rem, 2.2vw, 1.25rem)',
          }}
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

  const active = (k: TabKey) =>
    !showWelcome && tab === k ? 'tab-active' : ''

  return (
    <div className="flex flex-col gap-6 min-h-[calc(100vh-120px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        {/* Left cluster */}
        <div className="flex gap-2">
          {/* Candidate Matching */}
          <button
            onClick={() => {
              setTab('match')
              setShowWelcome(false)
            }}
            className={`tab ${active('match')}`}
          >
            Candidate Matching
          </button>

          {/* Sourcing dropdown */}
          <div className="relative" data-sourcing-root>
            <button
              onClick={(e) => {
                if (DISABLE_SOURCING) {
                  e.preventDefault()
                  e.stopPropagation()
                  return
                }
                setSourceOpen((v) => !v)
              }}
              className={`tab ${
                !DISABLE_SOURCING ? active('source') : ''
              } ${DISABLE_SOURCING ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                DISABLE_SOURCING
                  ? 'Sourcing (temporarily disabled)'
                  : 'Sourcing'
              }
              disabled={DISABLE_SOURCING}
              aria-disabled={DISABLE_SOURCING}
            >
              Sourcing
            </button>

            {!DISABLE_SOURCING && sourceOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                    sourceMode === 'candidates' ? 'font-medium' : ''
                  }`}
                  onClick={() => {
                    setSourceMode('candidates')
                    setTab('source')
                    setSourceOpen(false)
                    setShowWelcome(false)
                  }}
                >
                  Candidates
                </button>
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                    sourceMode === 'companies' ? 'font-medium' : ''
                  }`}
                  onClick={() => {
                    setSourceMode('companies')
                    setTab('source')
                    setSourceOpen(false)
                    setShowWelcome(false)
                  }}
                >
                  Companies
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CV dropdown */}
        <div className="relative" data-cv-root>
          <button
            onClick={() => setCvOpen((v) => !v)}
            className={`tab ${active('cv')}`}
          >
            CV Builder
          </button>
          {cvOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
              <button
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                  cvTemplate === 'uk' ? 'font-medium' : ''
                }`}
                onClick={() => {
                  setCvTemplate('uk')
                  setTab('cv')
                  setCvOpen(false)
                  setShowWelcome(false)
                }}
              >
                UK Format
              </button>
              <button
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                  cvTemplate === 'us' ? 'font-medium' : ''
                }`}
                onClick={() => {
                  setCvTemplate('us')
                  setTab('cv')
                  setCvOpen(false)
                  setShowWelcome(false)
                }}
              >
                US Format
              </button>
              <button
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                  cvTemplate === 'sales' ? 'font-medium' : ''
                }`}
                onClick={() => {
                  setCvTemplate('sales')
                  setTab('cv')
                  setCvOpen(false)
                  setShowWelcome(false)
                }}
              >
                Sales Format
              </button>
            </div>
          )}
        </div>

        {/* Right-aligned Active Campaign dropdown */}
        <div className="relative" data-ac-root>
          <button
            onClick={() => setAcOpen((v) => !v)}
            title="Active Campaign"
            aria-selected={!showWelcome && tab === 'ac'}
            className={`tab ${
              !showWelcome && tab === 'ac'
                ? '!bg-[#001961] !text-white !border-transparent hover:opacity-95 shadow-sm'
                : ''
            }`}
          >
            Active Campaign
          </button>

          {acOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
              <button
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                  acMode === 'upload' ? 'font-medium' : ''
                }`}
                onClick={() => {
                  setAcMode('upload')
                  setTab('ac')
                  setAcOpen(false)
                  setShowWelcome(false)
                }}
              >
                Upload
              </button>
              <button
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                  acMode === 'html' ? 'font-medium' : ''
                }`}
                onClick={() => {
                  setAcMode('html')
                  setTab('ac')
                  setAcOpen(false)
                  setShowWelcome(false)
                }}
              >
                HTML Build
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1">
        {showWelcome ? (
          <WelcomeBlock />
        ) : (
          <>
            {tab === 'match' && <MatchTab />}
            {tab === 'source' && <SourceTab mode={sourceMode} />}
            {tab === 'cv' && cvTemplate === 'uk' && <CvUkTab />}
            {tab === 'cv' && cvTemplate === 'us' && <CvUsTab />}
            {tab === 'cv' && cvTemplate === 'sales' && <CvSalesTab />}
            {tab === 'social' && <SocialMediaTab mode={socialMode} />}
            {tab === 'ac' && acMode === 'upload' && <ActiveCampaignUploadTab />}
            {tab === 'ac' && acMode === 'html' && <ActiveCampaignHtmlTab />}
          </>
        )}
      </div>
    </div>
  )
}

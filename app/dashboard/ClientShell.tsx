'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import each tab to prevent SSR on client-only code
const MatchTab                = dynamic(() => import('./_match/MatchTab'),   { ssr: false })
const SourceTab               = dynamic(() => import('./_source/SourceTab'), { ssr: false })
const CvTab                   = dynamic(() => import('./_cv/CvTab'),         { ssr: false })
const SocialMediaTab          = dynamic(() => import('./_social/SocialMediaTab'), { ssr: false })
const JobZoneTab              = dynamic(() => import('./_social/JobZoneTab'), { ssr: false })
const ActiveCampaignUploadTab = dynamic(() => import('./_ac/ActiveCampaignTab'), { ssr: false })
const ActiveCampaignHtmlTab   = dynamic(() => import('./_ac/ActiveCampaignHtmlTab'), { ssr: false })

type TabKey     = 'match' | 'source' | 'cv' | 'social' | 'ac'
type SourceMode = 'people' | 'companies'
type CvTemplate = 'uk' | 'us' | 'sales'   // Updated: support UK & US formats
type SocialMode = 'jobPosts' | 'jobZone'

//  Toggle to re-enable later
const DISABLE_SOURCING = false
const DISABLE_SOCIAL   = false

export default function ClientShell(): JSX.Element {
  const [tab, setTab]                 = useState<TabKey>('match')
  const [showWelcome, setShowWelcome] = useState<boolean>(true)

  const [sourceOpen, setSourceOpen]   = useState(false)
  const [sourceMode, setSourceMode]   = useState<SourceMode>('people')

  const [cvOpen, setCvOpen]           = useState(false)
  const [cvTemplate, setCvTemplate]   = useState<CvTemplate>('uk') // default to UK

  const [socialOpen, setSocialOpen]   = useState(false)
  const [socialMode, setSocialMode]   = useState<SocialMode>('jobPosts')

  const [acOpen, setAcOpen]           = useState(false)
  const [acMode, setAcMode]           = useState<'upload' | 'html'>('upload')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest?.('[data-sourcing-root]')) setSourceOpen(false)
      if (!t.closest?.('[data-cv-root]'))       setCvOpen(false)
      if (!t.closest?.('[data-social-root]'))   setSocialOpen(false)
      if (!t.closest?.('[data-ac-root]'))       setAcOpen(false)
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
          &gt; - &lt;
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
      <div className="flex flex-col gap-6 min-h-[calc(100vh-120px)]">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          {/* Left cluster */}
          <div className="flex gap-2">
            {/* Candidate Matching */}
            <button
              onClick={() => { setTab('match'); setShowWelcome(false) }}
              className={`tab ${active('match')}`}
            >
              Candidate Matching
            </button>

            {/* Sourcing dropdown */}
            <div className="relative" data-sourcing-root>
              <button
                onClick={(e) => {
                  if (DISABLE_SOURCING) { e.preventDefault(); e.stopPropagation(); return }
                  setSourceOpen(v => !v)
                }}
                className={`tab ${!DISABLE_SOURCING ? active('source') : ''} ${DISABLE_SOURCING ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={DISABLE_SOURCING ? 'Sourcing (temporarily disabled)' : 'Sourcing'}
                disabled={DISABLE_SOURCING}
                aria-disabled={DISABLE_SOURCING}
              >
                Sourcing
              </button>

              {!DISABLE_SOURCING && sourceOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
                  <button
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${sourceMode === 'people' ? 'font-medium' : ''}`}
                    onClick={() => { setSourceMode('people'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                  >
                    People
                  </button>
                  <button
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${sourceMode === 'companies' ? 'font-medium' : ''}`}
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
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${cvTemplate === 'uk' ? 'font-medium' : ''}`}
                    onClick={() => { setCvTemplate('uk'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                  >
                    UK Format
                  </button>
                  <button
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${cvTemplate === 'us' ? 'font-medium' : ''}`}
                    onClick={() => { setCvTemplate('us'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                  >
                    US Format
                  </button>
                  <button
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${cvTemplate === 'sales' ? 'font-medium' : ''}`}
                    onClick={() => { setCvTemplate('sales'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                  >
                    Sales Format
                  </button>
                </div>
              )}
            </div>

            {/* Social Media dropdown (left cluster) */}
            <div className="relative" data-social-root>
              <button
                onClick={(e) => {
                  if (DISABLE_SOCIAL) { e.preventDefault(); e.stopPropagation(); return }
                  setSocialOpen(v => !v)
                }}
                className={`tab ${!DISABLE_SOCIAL ? active('social') : ''} ${DISABLE_SOCIAL ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={DISABLE_SOCIAL ? 'Social Media (temporarily disabled)' : 'Social Media'}
                disabled={DISABLE_SOCIAL}
                aria-disabled={DISABLE_SOCIAL}
              >
                Social Media
              </button>

              {!DISABLE_SOCIAL && socialOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
                  <button
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                      socialMode === 'jobPosts' ? 'font-medium' : ''
                    }`}
                    onClick={() => {
                      setSocialMode('jobPosts')
                      setTab('social')
                      setSocialOpen(false)
                      setShowWelcome(false)
                    }}
                  >
                    Job Posts
                  </button>
                  <button
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                      socialMode === 'jobZone' ? 'font-medium' : ''
                    }`}
                    onClick={() => {
                      setSocialMode('jobZone')
                      setTab('social')
                      setSocialOpen(false)
                      setShowWelcome(false)
                    }}
                  >
                    Job Zone
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right-aligned Active Campaign dropdown */}
          <div className="relative" data-ac-root>
            <button
              onClick={() => setAcOpen(v => !v)}
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
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${acMode === 'upload' ? 'font-medium' : ''}`}
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
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${acMode === 'html' ? 'font-medium' : ''}`}
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
              {tab === 'cv' && <CvTab templateFromShell={cvTemplate} />}

              {tab === 'social' && socialMode === 'jobPosts' && (
                <SocialMediaTab mode="jobPosts" />
              )}
              {tab === 'social' && socialMode === 'jobZone' && (
                <JobZoneTab />
              )}

              {tab === 'ac' && acMode === 'upload' && <ActiveCampaignUploadTab />}
              {tab === 'ac' && acMode === 'html'   && <ActiveCampaignHtmlTab />}
            </>
          )}
        </div>
      </div>
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'

// Dynamically import each tab
const MatchTab                = dynamic(() => import('./_match/MatchTab'), { ssr: false })
const WooTab                  = dynamic(() => import('./_match/WooTab'), { ssr: false })
const SourceTab               = dynamic(() => import('./_source/SourceTab'), { ssr: false })
const CvTab                   = dynamic(() => import('./_cv/CvTab'), { ssr: false })
const SocialMediaTab          = dynamic(() => import('./_social/SocialMediaTab'), { ssr: false })
const JobZoneTab              = dynamic(() => import('./_social/JobZoneTab'), { ssr: false })
const ContentCreationSection  = dynamic(() => import('./_social/ContentCreationSection'), { ssr: false })
const ActiveCampaignUploadTab = dynamic(() => import('./_ac/ActiveCampaignTab'), { ssr: false })
const ActiveCampaignHtmlTab   = dynamic(() => import('./_ac/ActiveCampaignHtmlTab'), { ssr: false })
const DataTab                 = dynamic(() => import('./_data/DataTab'), { ssr: false })

// Add new tab modes
type TabKey = 'match' | 'source' | 'cv' | 'social' | 'ac' | 'data'
type MatchMode = 'woo' | 'zawa'
type SourceMode = 'people' | 'companies'
type CvTemplate = 'uk' | 'us' | 'sales'
type SocialMode = 'content' | 'jobPosts' | 'jobZone'

export default function ClientShell(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('match')
  const [showWelcome, setShowWelcome] = useState(true)

  // NEW — Matching dropdown
  const [matchOpen, setMatchOpen] = useState(false)
  const [matchMode, setMatchMode] = useState<MatchMode>('zawa')

  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState<SourceMode>('people')

  const [cvOpen, setCvOpen] = useState(false)
  const [cvTemplate, setCvTemplate] = useState<CvTemplate>('uk')

  const [socialOpen, setSocialOpen] = useState(false)
  const [socialMode, setSocialMode] = useState<SocialMode>('content')

  const [acOpen, setAcOpen] = useState(false)
  const [acMode, setAcMode] = useState<'upload' | 'html'>('upload')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest('[data-match-root]')) setMatchOpen(false)
      if (!t.closest('[data-sourcing-root]')) setSourceOpen(false)
      if (!t.closest('[data-cv-root]')) setCvOpen(false)
      if (!t.closest('[data-social-root]')) setSocialOpen(false)
      if (!t.closest('[data-ac-root]')) setAcOpen(false)
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
          &gt; ZAWA &lt;
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
        
        {/* Top Bar */}
        <div className="flex items-center justify-between">

          {/* LEFT cluster */}
          <div className="flex gap-2">

            {/* MATCHING — NOW A DROPDOWN */}
            <div className="relative" data-match-root>
              <button
                onClick={() => setMatchOpen(v => !v)}
                className={`tab ${active('match')}`}
              >
                Candidate Matching
              </button>

              {matchOpen && (
                <div className="absolute z-50 mt-2 w-48 bg-white rounded-xl border shadow-xl text-left">
                  
                  <button
                    onClick={() => {
                      setMatchMode('woo')
                      setTab('match')
                      setMatchOpen(false)
                      setShowWelcome(false)
                    }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    Woo Matching
                  </button>

                  <button
                    onClick={() => {
                      setMatchMode('zawa')
                      setTab('match')
                      setMatchOpen(false)
                      setShowWelcome(false)
                    }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    ZAWA Matching
                  </button>

                </div>
              )}
            </div>

            {/* SOURCING */}
            <div className="relative" data-sourcing-root>
              <button
                onClick={() => setSourceOpen(v => !v)}
                className={`tab ${active('source')}`}
              >
                Sourcing
              </button>

              {sourceOpen && (
                <div className="absolute z-50 mt-2 w-44 bg-white rounded-xl border shadow-xl text-left">
                  <button 
                    onClick={() => { setSourceMode('people'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    People
                  </button>

                  <button 
                    onClick={() => { setSourceMode('companies'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    Companies
                  </button>
                </div>
              )}
            </div>

            {/* CV Formatting */}
            <div className="relative" data-cv-root>
              <button 
                onClick={() => setCvOpen(v => !v)} 
                className={`tab ${active('cv')}`}
              >
                CV Formatting
              </button>

              {cvOpen && (
                <div className="absolute z-50 mt-2 w-44 bg-white rounded-xl border shadow-xl text-left">
                  <button 
                    onClick={() => { setCvTemplate('uk'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    UK Format
                  </button>

                  <button 
                    onClick={() => { setCvTemplate('us'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    US Format
                  </button>

                  <button 
                    onClick={() => { setCvTemplate('sales'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    Sales Format
                  </button>
                </div>
              )}
            </div>

            {/* SOCIAL */}
            <div className="relative" data-social-root>
              <button 
                onClick={() => setSocialOpen(v => !v)} 
                className={`tab ${active('social')}`}
              >
                Social Media
              </button>

              {socialOpen && (
                <div className="absolute z-50 mt-2 w-48 bg-white rounded-xl border shadow-xl text-left">
                  <button 
                    onClick={() => { setSocialMode('content'); setTab('social'); setSocialOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    Content Creation
                  </button>

                  <button 
                    onClick={() => { setSocialMode('jobPosts'); setTab('social'); setSocialOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    Job Posts
                  </button>

                  <button 
                    onClick={() => { setSocialMode('jobZone'); setTab('social'); setSocialOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    Job Zone
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SIDE — Data Icon + Active Campaign */}
          <div className="flex items-center gap-2">

            {/* DATA ICON */}
            <button
              onClick={() => {
                setTab('data')
                setShowWelcome(false)
                setAcOpen(false)
              }}
              title="Data"
              className={`tab ${active('data')} flex items-center justify-center h-[40px] px-4`}
            >
              <Image
                src="/Data-Icon.png"
                width={16}
                height={16}
                alt="Data"
              />
            </button>

            {/* ACTIVE CAMPAIGN */}
            <div className="relative" data-ac-root>
              <button
                onClick={() => setAcOpen(v => !v)}
                className={`tab ${active('ac')}`}
              >
                Active Campaign
              </button>

              {acOpen && (
                <div className="absolute z-50 right-0 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden text-left">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    onClick={() => { setAcMode('upload'); setTab('ac'); setAcOpen(false); setShowWelcome(false) }}
                  >
                    Upload
                  </button>

                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    onClick={() => { setAcMode('html'); setTab('ac'); setAcOpen(false); setShowWelcome(false) }}
                  >
                    HTML Build
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1">
          {showWelcome ? (
            <WelcomeBlock />
          ) : (
            <>
              {/* MATCH SELECTION */}
              {tab === 'match' && matchMode === 'zawa' && <MatchTab />}
              {tab === 'match' && matchMode === 'woo'  && <WooTab />}

              {tab === 'source' && <SourceTab mode={sourceMode} />}
              {tab === 'cv' && <CvTab templateFromShell={cvTemplate} />}

              {tab === 'social' && socialMode === 'content'  && <ContentCreationSection />}
              {tab === 'social' && socialMode === 'jobPosts' && <SocialMediaTab mode="jobPosts" />}
              {tab === 'social' && socialMode === 'jobZone'  && <JobZoneTab />}

              {tab === 'ac' && acMode === 'upload' && <ActiveCampaignUploadTab />}
              {tab === 'ac' && acMode === 'html'   && <ActiveCampaignHtmlTab />}
              {tab === 'data' && <DataTab />}
            </>
          )}
        </div>
      </div>
    </>
  )
}

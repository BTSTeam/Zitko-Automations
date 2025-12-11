'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'

// Dynamically import each tab
const MatchTab                = dynamic(() => import('./_match/MatchTab'), { ssr: false })
const WooTab                 = dynamic(() => import('./_match/WooTab'),  { ssr: false })
const SourceTab               = dynamic(() => import('./_source/SourceTab'), { ssr: false })
const CvTab                   = dynamic(() => import('./_cv/CvTab'), { ssr: false })
const SocialMediaTab          = dynamic(() => import('./_social/SocialMediaTab'), { ssr: false })
const JobZoneTab              = dynamic(() => import('./_social/JobZoneTab'), { ssr: false })
const ActiveCampaignUploadTab = dynamic(() => import('./_ac/ActiveCampaignTab'), { ssr: false })
const ActiveCampaignHtmlTab   = dynamic(() => import('./_ac/ActiveCampaignHtmlTab'), { ssr: false })
const DataTab                 = dynamic(() => import('./_data/DataTab'), { ssr: false })

// Add new tab
type TabKey = 'match' | 'source' | 'cv' | 'social' | 'ac' | 'data'
type SourceMode = 'people' | 'companies'
type CvTemplate = 'uk' | 'us' | 'sales'
type SocialMode = 'jobPosts' | 'jobZone'
type MatchMode = 'zawa' | 'woo'   // NEW

// Toggles
const DISABLE_SOURCING = false
const DISABLE_SOCIAL   = false

export default function ClientShell(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('match')
  const [showWelcome, setShowWelcome] = useState(true)

  // Matching dropdown
  const [matchOpen, setMatchOpen] = useState(false)        // NEW
  const [matchMode, setMatchMode] = useState<MatchMode>('zawa') // NEW

  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState<SourceMode>('people')

  const [cvOpen, setCvOpen] = useState(false)
  const [cvTemplate, setCvTemplate] = useState<CvTemplate>('uk')

  const [socialOpen, setSocialOpen] = useState(false)
  const [socialMode, setSocialMode] = useState<SocialMode>('jobPosts')

  const [acOpen, setAcOpen] = useState(false)
  const [acMode, setAcMode] = useState<'upload' | 'html'>('upload')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest('[data-match-root]')) setMatchOpen(false)   // NEW
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

            {/* MATCHING — UPDATED TO DROPDOWN */}
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
                      setMatchMode('zawa'); 
                      setTab('match'); 
                      setMatchOpen(false); 
                      setShowWelcome(false)
                    }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    ZAWA Matching
                  </button>

                  <button
                    onClick={() => { 
                      setMatchMode('woo'); 
                      setTab('match'); 
                      setMatchOpen(false); 
                      setShowWelcome(false)
                    }}
                    className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                  >
                    Woo Matching
                  </button>

                </div>
              )}
            </div>

            {/* SOURCING (unchanged) */}
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

            {/* CV + SOCIAL + AC — unchanged */}
            {/* … (no modifications required) … */}

          </div>

          {/* RIGHT SIDE (Data + Active Campaign) — unchanged */}
          {/* … remains identical … */}

        </div>

        {/* CONTENT */}
        <div className="flex-1">
          {showWelcome ? (
            <WelcomeBlock />
          ) : (
            <>
              {/* MATCH LOGIC UPDATED */}
              {tab === 'match' && matchMode === 'zawa' && <MatchTab />}
              {tab === 'match' && matchMode === 'woo'  && <WooTab />}

              {tab === 'source' && <SourceTab mode={sourceMode} />}
              {tab === 'cv' && <CvTab templateFromShell={cvTemplate} />}
              {tab === 'social' && socialMode === 'jobPosts' && <SocialMediaTab mode="jobPosts" />}
              {tab === 'social' && socialMode === 'jobZone' && <JobZoneTab />}
              {tab === 'ac' && acMode === 'upload' && <ActiveCampaignUploadTab />}
              {tab === 'ac' && acMode === 'html' && <ActiveCampaignHtmlTab />}
              {tab === 'data' && <DataTab />}
            </>
          )}
        </div>
      </div>
    </>
  )
}

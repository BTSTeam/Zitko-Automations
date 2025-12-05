'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'

// Dynamically import each tab
const MatchTab                = dynamic(() => import('./_match/MatchTab'), { ssr: false })
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

// Toggles
const DISABLE_SOURCING = false
const DISABLE_SOCIAL   = false

export default function ClientShell(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('match')
  const [showWelcome, setShowWelcome] = useState(true)

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
        <h1 className="font-semibold uppercase" style={{ letterSpacing: '0.5em', fontSize: '3rem' }}>
          WELCOME
        </h1>
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

            {/* MATCHING */}
            <button onClick={() => { setTab('match'); setShowWelcome(false) }} className={`tab ${active('match')}`}>
              Candidate Matching
            </button>

            {/* SOURCING */}
            <div className="relative" data-sourcing-root>
              <button
                onClick={() => setSourceOpen(v => !v)}
                className={`tab ${active('source')}`}
              >
                Sourcing
              </button>
              {sourceOpen && (
                <div className="absolute mt-2 w-44 bg-white rounded-xl border shadow-xl">
                  <button onClick={() => { setSourceMode('people'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50">People</button>
                  <button onClick={() => { setSourceMode('companies'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50">Companies</button>
                </div>
              )}
            </div>

            {/* CV Formatting */}
            <div className="relative" data-cv-root>
              <button onClick={() => setCvOpen(v => !v)} className={`tab ${active('cv')}`}>CV Formatting</button>
              {cvOpen && (
                <div className="absolute mt-2 w-44 bg-white rounded-xl border shadow-xl">
                  <button onClick={() => { setCvTemplate('uk'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50">UK Format</button>
                  <button onClick={() => { setCvTemplate('us'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py2 hover:bg-gray-50">US Format</button>
                  <button onClick={() => { setCvTemplate('sales'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py2 hover:bg-gray-50">Sales Format</button>
                </div>
              )}
            </div>

            {/* SOCIAL */}
            <div className="relative" data-social-root>
              <button onClick={() => setSocialOpen(v => !v)} className={`tab ${active('social')}`}>
                Social Media
              </button>
              {socialOpen && (
                <div className="absolute mt-2 w-44 bg-white rounded-xl border shadow-xl">
                  <button onClick={() => { setSocialMode('jobPosts'); setTab('social'); setSocialOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50">Job Posts</button>
                  <button onClick={() => { setSocialMode('jobZone'); setTab('social'); setSocialOpen(false); setShowWelcome(false) }}
                    className="w-full px-3 py-2 hover:bg-gray-50">Job Zone</button>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT SIDE — Data Icon + Active Campaign */}
          <div className="flex items-center gap-2">

            {/* DATA ICON TAB (NEW POSITION) */}
            <button
              onClick={() => {
                setTab('data')
                setShowWelcome(false)
                setAcOpen(false)
              }}
              title="Data"
              className={`tab ${active('data')}`}
            >
              <Image
                src="/Data-Icon.png"
                width={16}
                height={16}
                alt="Data"
                className={`${tab === 'data' ? 'brightness-0 invert' : ''}`}
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
                <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden z-10">
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
              {tab === 'match' && <MatchTab />}
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

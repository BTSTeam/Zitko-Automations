'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'

/* =========================
   Feature toggles
   ========================= */

// Matching
const DISABLE_MATCH_WOO   = false
const DISABLE_MATCH_ZAWA  = false
const DISABLE_MATCH       = DISABLE_MATCH_WOO && DISABLE_MATCH_ZAWA

// Sourcing
const DISABLE_SOURCE_PEOPLE    = false
const DISABLE_SOURCE_COMPANIES = false
const DISABLE_SOURCE           = DISABLE_SOURCE_PEOPLE && DISABLE_SOURCE_COMPANIES

// CV Formatting
const DISABLE_CV_UK    = false
const DISABLE_CV_US    = false
const DISABLE_CV_SALES = false
const DISABLE_CV       = DISABLE_CV_UK && DISABLE_CV_US && DISABLE_CV_SALES

// Social (sub-sections)
const DISABLE_SOCIAL_CONTENT   = true
const DISABLE_SOCIAL_JOB_POSTS = false
const DISABLE_SOCIAL_JOB_ZONE  = false
const DISABLE_SOCIAL           = DISABLE_SOCIAL_CONTENT && DISABLE_SOCIAL_JOB_POSTS && DISABLE_SOCIAL_JOB_ZONE

// ActiveCampaign
const DISABLE_AC_UPLOAD = false
const DISABLE_AC_HTML   = false
const DISABLE_AC        = DISABLE_AC_UPLOAD && DISABLE_AC_HTML

// Data tab
const DISABLE_DATA = false

/* =========================
   Default modes based on toggles
   ========================= */

type TabKey     = 'match' | 'source' | 'cv' | 'social' | 'ac' | 'data'
type MatchMode  = 'woo' | 'zawa'
type SourceMode = 'people' | 'companies'
type CvTemplate = 'uk' | 'us' | 'sales'
type SocialMode = 'content' | 'jobPosts' | 'jobZone'

const DEFAULT_TAB: TabKey =
  !DISABLE_MATCH  ? 'match'  :
  !DISABLE_SOURCE ? 'source' :
  !DISABLE_CV     ? 'cv'     :
  !DISABLE_SOCIAL ? 'social' :
  !DISABLE_AC     ? 'ac'     :
  'data'

const DEFAULT_MATCH_MODE: MatchMode =
  !DISABLE_MATCH_ZAWA ? 'zawa' :
  'woo'

const DEFAULT_SOURCE_MODE: SourceMode =
  !DISABLE_SOURCE_PEOPLE ? 'people' : 'companies'

const DEFAULT_CV_TEMPLATE: CvTemplate =
  !DISABLE_CV_UK ? 'uk' :
  !DISABLE_CV_US ? 'us' :
  'sales'

const DEFAULT_SOCIAL_MODE: SocialMode =
  !DISABLE_SOCIAL_CONTENT   ? 'content'  :
  !DISABLE_SOCIAL_JOB_POSTS ? 'jobPosts' :
  'jobZone'

const DEFAULT_AC_MODE: 'upload' | 'html' =
  !DISABLE_AC_UPLOAD ? 'upload' : 'html'

/* =========================
   Dynamic imports
   ========================= */

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

export default function ClientShell(): JSX.Element {
  const [tab, setTab] = useState<TabKey>(DEFAULT_TAB)
  const [showWelcome, setShowWelcome] = useState(true)

  // Matching dropdown
  const [matchOpen, setMatchOpen] = useState(false)
  const [matchMode, setMatchMode] = useState<MatchMode>(DEFAULT_MATCH_MODE)

  // Sourcing dropdown
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState<SourceMode>(DEFAULT_SOURCE_MODE)

  // CV dropdown
  const [cvOpen, setCvOpen] = useState(false)
  const [cvTemplate, setCvTemplate] = useState<CvTemplate>(DEFAULT_CV_TEMPLATE)

  // Social dropdown
  const [socialOpen, setSocialOpen] = useState(false)
  const [socialMode, setSocialMode] = useState<SocialMode>(DEFAULT_SOCIAL_MODE)

  // ActiveCampaign dropdown
  const [acOpen, setAcOpen] = useState(false)
  const [acMode, setAcMode] = useState<'upload' | 'html'>(DEFAULT_AC_MODE)

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

const ChristmasCountdown = () => {
  const [time, setTime] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  })

  useEffect(() => {
    const target = new Date(new Date().getFullYear(), 11, 25, 0, 0, 0) // Dec 25 local time

    const tick = () => {
      const now = new Date()
      const diff = target.getTime() - now.getTime()

      if (diff <= 0) return

      setTime({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      })
    }

    tick()
    const i = setInterval(tick, 1000)
    return () => clearInterval(i)
  }, [])

  const Circle = ({ value }: { value: number }) => (
    <div className="relative w-24 h-24">
      <svg viewBox="0 0 36 36" className="w-full h-full">
        <path
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831
             a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="2"
        />
        <path
          d="M18 2.0845
             a 15.9155 15.9155 0 0 1 0 31.831"
          fill="none"
          stroke="#6BBF45"
          strokeWidth="2"
          strokeDasharray="75,100"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-4xl font-semibold text-red-600">
        {String(value).padStart(2, '0')}
      </div>
    </div>
  )

  return (
    <div className="mt-8 flex gap-6 justify-center">
      <Circle value={time.days} />
      <Circle value={time.hours} />
      <Circle value={time.minutes} />
      <Circle value={time.seconds} />
    </div>
  )
}
   
  const WelcomeBlock = () => (
    <section className="h-full grid place-items-center px-6">
      <div className="text-center select-none">
         <ChristmasCountdown />

        <h1
           className="font-semibold uppercase"
           style={{ color: '#3B3E44', letterSpacing: '0.5em', fontSize: 'clamp(2.25rem, 6vw, 6rem)' }}
         >
           WELCOME
         </h1>
         
         <p
           className="mt-6 font-semibold uppercase"
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
            {/* MATCHING */}
            {!DISABLE_MATCH && (
              <div className="relative" data-match-root>
                <button
                  onClick={() => setMatchOpen(v => !v)}
                  className={`tab ${active('match')}`}
                >
                  Candidate Matching
                </button>

                {matchOpen && (
                  <div className="absolute z-50 mt-2 w-48 bg-white rounded-xl border shadow-xl text-left">
                    {!DISABLE_MATCH_WOO && (
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
                    )}

                    {!DISABLE_MATCH_ZAWA && (
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
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SOURCING */}
            {!DISABLE_SOURCE && (
              <div className="relative" data-sourcing-root>
                <button
                  onClick={() => setSourceOpen(v => !v)}
                  className={`tab ${active('source')}`}
                >
                  Sourcing
                </button>

                {sourceOpen && (
                  <div className="absolute z-50 mt-2 w-44 bg-white rounded-xl border shadow-xl text-left">
                    {!DISABLE_SOURCE_PEOPLE && (
                      <button 
                        onClick={() => { setSourceMode('people'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                        className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        People
                      </button>
                    )}

                    {!DISABLE_SOURCE_COMPANIES && (
                      <button 
                        onClick={() => { setSourceMode('companies'); setTab('source'); setSourceOpen(false); setShowWelcome(false) }}
                        className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        Companies
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CV Formatting */}
            {!DISABLE_CV && (
              <div className="relative" data-cv-root>
                <button 
                  onClick={() => setCvOpen(v => !v)} 
                  className={`tab ${active('cv')}`}
                >
                  CV Formatting
                </button>

                {cvOpen && (
                  <div className="absolute z-50 mt-2 w-44 bg-white rounded-xl border shadow-xl text-left">
                    {!DISABLE_CV_UK && (
                      <button 
                        onClick={() => { setCvTemplate('uk'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                        className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        UK Format
                      </button>
                    )}

                    {!DISABLE_CV_US && (
                      <button 
                        onClick={() => { setCvTemplate('us'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                        className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        US Format
                      </button>
                    )}

                    {!DISABLE_CV_SALES && (
                      <button 
                        onClick={() => { setCvTemplate('sales'); setTab('cv'); setCvOpen(false); setShowWelcome(false) }}
                        className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        Sales Format
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SOCIAL */}
            {!DISABLE_SOCIAL && (
              <div className="relative" data-social-root>
                <button 
                  onClick={() => setSocialOpen(v => !v)} 
                  className={`tab ${active('social')}`}
                >
                  Social Media
                </button>

                {socialOpen && (
                  <div className="absolute z-50 mt-2 w-48 bg-white rounded-xl border shadow-xl text-left">
                    {!DISABLE_SOCIAL_CONTENT && (
                      <button 
                        onClick={() => { setSocialMode('content'); setTab('social'); setSocialOpen(false); setShowWelcome(false) }}
                        className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        Content Creation
                      </button>
                    )}

                    {!DISABLE_SOCIAL_JOB_POSTS && (
                      <button 
                        onClick={() => { setSocialMode('jobPosts'); setTab('social'); setSocialOpen(false); setShowWelcome(false) }}
                        className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        Job Posts
                      </button>
                    )}

                    {!DISABLE_SOCIAL_JOB_ZONE && (
                      <button 
                        onClick={() => { setSocialMode('jobZone'); setTab('social'); setSocialOpen(false); setShowWelcome(false) }}
                        className="w-full px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        Job Zone
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT SIDE — Data Icon + Active Campaign */}
          <div className="flex items-center gap-2">
            {/* DATA ICON */}
            {!DISABLE_DATA && (
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
            )}

            {/* ACTIVE CAMPAIGN */}
            {!DISABLE_AC && (
              <div className="relative" data-ac-root>
                <button
                  onClick={() => setAcOpen(v => !v)}
                  className={`tab ${active('ac')}`}
                >
                  Active Campaign
                </button>

                {acOpen && (
                  <div className="absolute z-50 right-0 mt-2 w-44 rounded-xl border bg-white shadow-lg overflow-hidden text-left">
                    {!DISABLE_AC_UPLOAD && (
                      <button
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        onClick={() => { setAcMode('upload'); setTab('ac'); setAcOpen(false); setShowWelcome(false) }}
                      >
                        Upload
                      </button>
                    )}

                    {!DISABLE_AC_HTML && (
                      <button
                        className="w-full text-left px-3 py-2 hover:bg-gray-50"
                        onClick={() => { setAcMode('html'); setTab('ac'); setAcOpen(false); setShowWelcome(false) }}
                      >
                        HTML Build
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1">
          {showWelcome ? (
            <WelcomeBlock />
          ) : (
            <>
              {/* MATCH SELECTION */}
              {tab === 'match' && matchMode === 'zawa' && !DISABLE_MATCH_ZAWA && <MatchTab />}
              {tab === 'match' && matchMode === 'woo'  && !DISABLE_MATCH_WOO  && <WooTab />}

              {tab === 'source' && !DISABLE_SOURCE && <SourceTab mode={sourceMode} />}

              {tab === 'cv' && !DISABLE_CV && (
                <CvTab templateFromShell={cvTemplate} />
              )}

              {tab === 'social' && socialMode === 'content'  && !DISABLE_SOCIAL_CONTENT   && <ContentCreationSection />}
              {tab === 'social' && socialMode === 'jobPosts' && !DISABLE_SOCIAL_JOB_POSTS && <SocialMediaTab mode="jobPosts" />}
              {tab === 'social' && socialMode === 'jobZone'  && !DISABLE_SOCIAL_JOB_ZONE  && <JobZoneTab />}

              {tab === 'ac' && acMode === 'upload' && !DISABLE_AC_UPLOAD && <ActiveCampaignUploadTab />}
              {tab === 'ac' && acMode === 'html'   && !DISABLE_AC_HTML   && <ActiveCampaignHtmlTab />}

              {tab === 'data' && !DISABLE_DATA && <DataTab />}
            </>
          )}
        </div>
      </div>
    </>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'

// 1) Define your tab keys (match your existing keys if different)
type TabKey = 'ac' | 'cv' | 'match' | 'sourcing'

// 2) Central tab config — mark Sourcing disabled
const TABS: { key: TabKey; label: string; disabled?: boolean }[] = [
  { key: 'ac', label: 'ActiveCampaign' },
  { key: 'cv', label: 'CV' },
  { key: 'match', label: 'Matching' },
  { key: 'sourcing', label: 'Sourcing', disabled: true }, // 👈 disabled
]

// 3) Lazy-load your sections as before (examples shown)
const ACSection = () => <div className="p-4">ActiveCampaign content…</div>
const CVSection = () => <div className="p-4">CV content…</div>
const MatchSection = () => <div className="p-4">Matching content…</div>
// We won’t render sourcing at all while disabled
const SourcingSection = () => null

export default function ClientShell() {
  // If URL sets a disabled tab, we’ll fall back to the first enabled tab.
  const firstEnabled = useMemo(
    () => TABS.find(t => !t.disabled)?.key ?? 'ac',
    []
  )

  // Initial tab: from URL ?tab=… or default
  const [tab, setTab] = useState<TabKey>(firstEnabled)

  useEffect(() => {
    const url = new URL(window.location.href)
    const qTab = (url.searchParams.get('tab') as TabKey | null) ?? null
    const desired = qTab && TABS.some(t => t.key === qTab) ? qTab : null
    const isDisabled = desired ? TABS.find(t => t.key === desired)?.disabled : false
    setTab((!desired || isDisabled) ? firstEnabled : desired)
  }, [firstEnabled])

  const handleClick = (t: TabKey, disabled?: boolean) => {
    if (disabled) return // 👈 do nothing
    setTab(t)
    // keep URL tidy (optional)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t)
    window.history.replaceState(null, '', url.toString())
  }

  const Content = useMemo(() => {
    switch (tab) {
      case 'ac': return <ACSection />
      case 'cv': return <CVSection />
      case 'match': return <MatchSection />
      case 'sourcing': return <SourcingSection /> // won’t show anyway
      default: return null
    }
  }, [tab])

  return (
    <div className="grid gap-4">
      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {TABS.map(t => {
          const isActive = tab === t.key
          const isDisabled = !!t.disabled
          return (
            <button
              key={t.key}
              type="button"
              aria-disabled={isDisabled}
              title={isDisabled ? 'Coming soon' : t.label}
              onClick={() => handleClick(t.key, isDisabled)}
              className={[
                'px-3 py-2 rounded-xl border transition',
                isActive && !isDisabled ? 'bg-[#F7941D] text-white border-[#F7941D]' : 'bg-white',
                !isActive && !isDisabled ? 'hover:bg-gray-50' : '',
                isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none grayscale border-gray-200 text-gray-400' : 'border-gray-200 text-gray-800',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div className="card rounded-2xl border">
        {Content}
      </div>
    </div>
  )
}

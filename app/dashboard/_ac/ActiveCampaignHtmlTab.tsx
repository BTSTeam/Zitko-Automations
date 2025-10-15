// app/dashboard/_ac/ActiveCampaignHtmlTab.tsx
'use client'

import { useState } from 'react'

// replicate password gate from ActiveCampaignTab
function normalizeEnvPw(s: string | undefined | null) {
  const t = String(s ?? '').trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1)
  }
  return t
}
const RAW_ENV = process.env.NEXT_PUBLIC_ACTIVE_CAMPAIGN_TAB ?? ''
const TAB_PW = normalizeEnvPw(RAW_ENV)

export default function ActiveCampaignHtmlTab() {
  const [unlocked, setUnlocked] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')

  function tryUnlock(e?: React.FormEvent) {
    e?.preventDefault()
    if (!TAB_PW) {
      setPwError('Password is not configured on this deployment.')
      return
    }
    const typed = pw.trim()
    if (typed === TAB_PW) {
      setUnlocked(true)
      setPwError('')
    } else {
      setPwError('Incorrect password. Access denied.')
    }
  }

  if (!unlocked) {
    return (
      <div className="relative min-h-[60vh]">
        <div className="absolute inset-0 grid place-items-center bg-white">
          <form
            onSubmit={tryUnlock}
            className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm"
          >
            <div className="text-center mb-4">
              <div className="text-4xl">🔒</div>
              <h2 className="mt-2 text-lg font-semibold">Restricted Area</h2>
              <p className="text-sm text-gray-600">Enter the password to access ActiveCampaign tools.</p>
            </div>
            
            <label className="grid gap-1">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                className={`rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001961] ${
                  pwError ? 'border-red-500' : ''
                }`}
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value)
                  if (pwError) setPwError('')
                }}
                placeholder="••••••••"
                autoFocus
              />
            </label>
            {pwError && (
              <div className="mt-2 text-sm text-red-600">{pwError}</div>
            )}
            <button
              type="submit"
              className="mt-4 w-full rounded-full px-5 py-3 font-medium !bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  // placeholder until HTML build requirements are provided
  return (
    <div className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">HTML Build (Coming Soon)</h2>
      <p className="text-gray-600">
        This section will allow you to build custom HTML campaigns. Stay tuned!
      </p>
    </div>
  )
}

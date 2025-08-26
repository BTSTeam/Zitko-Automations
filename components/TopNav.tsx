'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type MeResp = {
  loggedIn: boolean
  email?: string | null
  name?: string | null
  vincereConnected?: boolean
}

export default function TopNav() {
  const router = useRouter()
  const [me, setMe] = useState<MeResp>({ loggedIn: false, email: '', name: '', vincereConnected: false })

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' })
        const j: MeResp = await r.json()
        setMe({
          loggedIn: !!j?.loggedIn,
          email: j?.email ?? '',
          name: j?.name ?? '',
          vincereConnected: !!j?.vincereConnected,
        })
      } catch {
        setMe({ loggedIn: false, email: '', name: '', vincereConnected: false })
      }
    }
    load()
  }, [])

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setMe({ loggedIn: false, email: '', name: '', vincereConnected: false })
      router.push('/login')
    }
  }

  const connectVincere = () => {
    // Start OAuth; after callback your /api/auth/callback should store tokens in session
    window.location.href = '/api/auth/authorize'
  }

  const displayName = (me.name?.trim() || '').toString()

  return (
    <header className="bg-white border-b">
      <div className="container flex items-center justify-between py-3">
        {/* Brand: logo + title */}
        <Link href="/dashboard" className="flex items-center gap-3">
          <img src="/Zitko_Logo-removebg-preview.png" alt="Zitko" className="h-8 w-auto" />
          <div className="leading-tight">
            <div className="font-semibold">Zitko Automations</div>
            <div className="text-xs text-gray-500">AI Powered Automation Platform</div>
          </div>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Greeting */}
          <div className="text-sm text-right hidden sm:block">
            {me.loggedIn ? (
              <>
                <div>Welcome{displayName ? `, ${displayName}` : ''}</div>
                <div className="text-gray-500">{me.email || ''}</div>
              </>
            ) : (
              <div className="text-gray-500">Not signed in</div>
            )}
          </div>

          {/* User Management (person bust) */}
          <Link href="/settings/users" className="tab" title="User Management">
            <span aria-hidden>👤</span>
          </Link>

          {/* Vincere connection status */}
          <button
            type="button"
            onClick={!me.vincereConnected ? connectVincere : undefined}
            title={me.vincereConnected ? 'Connected to Vincere' : 'Connect to Vincere'}
            className={`tab flex items-center gap-2 ${me.vincereConnected ? 'text-green-600' : 'text-red-600'}`}
          >
            {/* Optional logo (add /public/vincere-logo.png if you like). If not present, the text still shows. */}
            <img
              src="/vincere-logo.png"
              alt=""
              className="h-4 w-auto hidden sm:inline"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <span>{me.vincereConnected ? 'Connected' : 'Not Connected'}</span>
          </button>

          {/* Sign In / Out */}
          {me.loggedIn ? (
            <button className="tab" onClick={signOut}>Sign Out</button>
          ) : (
            <Link href="/login" className="tab">Sign In</Link>
          )}
        </div>
      </div>
    </header>
  )
}

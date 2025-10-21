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
  const [apolloConnected, setApolloConnected] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, apolloRes] = await Promise.all([
          fetch('/api/auth/me', { cache: 'no-store' }),
          fetch('/api/apollo/status', { cache: 'no-store' })
        ])
        const j: MeResp = await meRes.json().catch(() => ({ loggedIn: false }))
        const a = await apolloRes.json().catch(() => ({ connected: false }))
        setMe({
          loggedIn: !!j?.loggedIn,
          email: j?.email ?? '',
          name: j?.name ?? '',
          vincereConnected: !!j?.vincereConnected,
        })
        setApolloConnected(!!a?.connected)
      } catch {
        setMe({ loggedIn: false, email: '', name: '', vincereConnected: false })
        setApolloConnected(false)
      }
    }
    load()
  }, [])

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setMe({ loggedIn: false, email: '', name: '', vincereConnected: false })
      setApolloConnected(false)
      router.push('/login')
    }
  }

  const connectVincere = () => {
    window.location.href = '/api/auth/authorize'
  }

  const connectApollo = () => {
    // starts the OAuth Authorization Code flow you already built
    window.location.href = '/api/apollo/oauth/authorize'
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

          {/* User Management */}
          <Link href="/settings/users" className="tab" title="User Management">
            <span aria-hidden>👤</span>
          </Link>

          {/* Vincere connection */}
          <button
            type="button"
            onClick={!me.vincereConnected ? connectVincere : undefined}
            title={me.vincereConnected ? 'Connected to Vincere' : 'Connect to Vincere'}
            className={`tab flex items-center gap-2 ${me.vincereConnected ? 'text-green-600' : 'text-red-600'}`}
          >
            <img
              src="/vincere-logo.png"
              alt=""
              className="h-4 w-auto hidden sm:inline"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <span>{me.vincereConnected ? 'Connected' : 'Not Connected'}</span>
          </button>

          {/* Apollo icon button (yellow when connected) */}
          <button
            type="button"
            onClick={!apolloConnected ? connectApollo : undefined}
            title={apolloConnected ? 'Apollo connected' : 'Connect Apollo'}
            aria-label={apolloConnected ? 'Apollo connected' : 'Connect Apollo'}
            className={[
              'h-9 w-9 grid place-items-center rounded-full border transition',
              apolloConnected ? 'bg-yellow-300 border-yellow-400' : 'bg-white border-gray-200 hover:bg-gray-50'
            ].join(' ')}
          >
            <img
              src="/Apollo-Logo.png"  // drop your logo in /public
              alt="Apollo"
              className="h-4 w-4"
            />
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

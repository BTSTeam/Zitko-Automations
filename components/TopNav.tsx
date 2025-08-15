'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type MeResp = { loggedIn: boolean; email?: string | null }

export default function TopNav() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' })
        const j: MeResp = await r.json()
        setLoggedIn(Boolean(j?.loggedIn))
        setEmail(j?.email ?? '')
      } catch {
        setLoggedIn(false)
        setEmail('')
      }
    }
    load()
  }, [])

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setLoggedIn(false)
      setEmail('')
      router.push('/login')
    }
  }

  return (
    <header className="bg-white border-b">
      <div className="container flex items-center justify-between py-3">
        {/* Brand: logo + title */}
        <Link href="/dashboard" className="flex items-center gap-3">
          <img
            src="/Zitko_Logo-removebg-preview.png"  // must exist in /public
            alt="Zitko"
            className="h-8 w-auto"
          />
          <div className="leading-tight">
            <div className="font-semibold">Zitko Automations</div>
            <div className="text-xs text-gray-500">AI Powered Automation Platform</div>
          </div>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="text-sm text-right hidden sm:block">
            {loggedIn ? (
              <>
                <div>Welcome</div>
                <div className="text-gray-500">{email}</div>
              </>
            ) : (
              <div className="text-gray-500">Not signed in</div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setOpen(v => !v)}
              className="tab"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              ⚙️
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-52 bg-white border rounded-xl shadow-soft z-10">
                <Link className="block px-3 py-2 hover:bg-gray-50" href="/settings/users">
                  User Management
                </Link>
                <Link className="block px-3 py-2 hover:bg-gray-50" href="/settings/integrations">
                  Integration Settings
                </Link>
              </div>
            )}
          </div>

          {loggedIn ? (
            <button className="tab" onClick={signOut}>Sign Out</button>
          ) : (
            <Link href="/login" className="tab">Sign In</Link>
          )}
        </div>
      </div>
    </header>
  )
}

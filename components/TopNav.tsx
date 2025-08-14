'use client'
import Link from 'next/link'
import { useState } from 'react'

export default function TopNav({ user }: { user?: { name?: string, email?: string } }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="bg-white border-b">
      <div className="container flex items-center justify-between py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full border flex items-center justify-center text-brand-orange font-bold">Z</div>
          <div className="leading-tight">
            <div className="font-semibold">Zitko Automations</div>
            <div className="text-xs text-gray-500">AI Powered Automation Platform</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="text-sm text-right hidden sm:block">
            <div>Welcome{user?.name ? `, ${user.name}` : ''}</div>
            <div className="text-gray-500">{user?.email || ''}</div>
          </div>
          <div className="relative">
            <button onClick={() => setOpen(v=>!v)} className="tab">⚙️</button>
            {open && (
              <div className="absolute right-0 mt-2 w-52 bg-white border rounded-xl shadow-soft z-10">
                <Link className="block px-3 py-2 hover:bg-gray-50" href="/settings/users">User Management</Link>
                <Link className="block px-3 py-2 hover:bg-gray-50" href="/settings/integrations">Integration Settings</Link>
              </div>
            )}
          </div>
          <Link href="/api/auth/authorize" className="tab">Sign In</Link>
        </div>
      </div>
    </header>
  )
}

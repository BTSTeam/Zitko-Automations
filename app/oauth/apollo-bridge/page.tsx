// app/oauth/apollo-bridge/page.tsx
'use client'
import { useEffect } from 'react'

function getParamFromHash(name: string) {
  // hash looks like: #/oauth/authorize?code=...&state=...  or  #/oauth/callback?code=...
  const hash = window.location.hash || ''
  const qIndex = hash.indexOf('?')
  if (qIndex === -1) return null
  const qs = hash.slice(qIndex + 1)
  const params = new URLSearchParams(qs)
  return params.get(name)
}

export default function ApolloBridge() {
  useEffect(() => {
    // Try both hash and query string (just in case)
    const code =
      getParamFromHash('code') || new URLSearchParams(window.location.search).get('code')
    const state =
      getParamFromHash('state') || new URLSearchParams(window.location.search).get('state')
    const err =
      getParamFromHash('error') ||
      getParamFromHash('error_message') ||
      new URLSearchParams(window.location.search).get('error')

    // Decide where to go next
    if (err) {
      const url = new URL('/dashboard', window.location.origin)
      url.searchParams.set('error', err)
      window.location.replace(url.toString())
      return
    }

    if (code) {
      const url = new URL('/api/apollo/oauth/callback', window.location.origin)
      url.searchParams.set('code', code)
      if (state) url.searchParams.set('state', state)
      window.location.replace(url.toString())
      return
    }

    // Nothing found → show a friendly message or bounce back
    const url = new URL('/dashboard', window.location.origin)
    url.searchParams.set('error', 'missing_code')
    window.location.replace(url.toString())
  }, [])

  return (
    <div className="p-6 text-sm text-gray-700">
      Connecting to Apollo… please wait.
    </div>
  )
}

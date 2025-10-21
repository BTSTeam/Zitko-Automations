'use client'
import { useEffect } from 'react'

function getParamFromHash(name: string) {
  const hash = window.location.hash || ''
  const qIndex = hash.indexOf('?')
  if (qIndex === -1) return null
  const qs = hash.slice(qIndex + 1)
  const params = new URLSearchParams(qs)
  return params.get(name)
}

export default function ApolloBridge() {
  useEffect(() => {
    const code =
      getParamFromHash('code') || new URLSearchParams(window.location.search).get('code')
    const state =
      getParamFromHash('state') || new URLSearchParams(window.location.search).get('state')
    const err =
      getParamFromHash('error') ||
      getParamFromHash('error_message') ||
      new URLSearchParams(window.location.search).get('error')

    const base = window.location.origin
    const dashboardUrl = `${base}/dashboard`

    // If Apollo returned an error, go back to dashboard with error param
    if (err) {
      window.location.replace(`${dashboardUrl}?error=${encodeURIComponent(err)}`)
      return
    }

    // If we have a code, forward it to the server callback for token exchange
    if (code) {
      const url = new URL('/api/apollo/oauth/callback', base)
      url.searchParams.set('code', code)
      if (state) url.searchParams.set('state', state)
      window.location.replace(url.toString())
      return
    }

    // Otherwise redirect back to dashboard with an error
    window.location.replace(`${dashboardUrl}?error=missing_code`)
  }, [])

  return (
    <div className="p-6 text-sm text-gray-700">
      Connecting to Apollo… please wait.
    </div>
  )
}

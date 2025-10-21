// app/api/apollo/oauth/apollo-bridge/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (code) {
    // If code arrived as query, go straight to the server callback.
    const cb = new URL('/api/apollo/oauth/callback', url.origin)
    cb.searchParams.set('code', code)
    if (state) cb.searchParams.set('state', state)
    return NextResponse.redirect(cb.toString(), 308)
  }

  // Otherwise fall back to the client bridge page (to read hash fragment if present).
  url.pathname = '/oauth/apollo-bridge'
  url.search = '' // let the client page read ?/hash fresh
  return NextResponse.redirect(url.toString(), 308)
}

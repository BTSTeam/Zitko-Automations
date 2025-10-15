// app/api/html-build/owner/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

// TODO: wire this to your real user store (or Vincere users)
// e.g., fetch('/api/users/list') then match by name.
// For immediate use, add known owners here:
const MAP: Record<string, { email: string; phone: string }> = {
  // 'First Last': { email: 'first.last@zitko.co.uk', phone: '+44 1234 567890' },
}

export async function POST(req: NextRequest) {
  try {
    const { name = '' } = await req.json()
    const key = String(name || '').trim().toLowerCase()
    const hit = MAP[key] || Object.entries(MAP).find(([k]) => k.toLowerCase() === key)?.[1]
    return NextResponse.json({
      name,
      email: hit?.email || '',
      phone: hit?.phone || '',
    })
  } catch (e: any) {
    return NextResponse.json({ name: '', email: '', phone: '' })
  }
}

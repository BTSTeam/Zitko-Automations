// app/api/apollo/status/route.ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  const connected = Boolean(session.tokens?.apolloAccessToken)
  return NextResponse.json({ connected })
}

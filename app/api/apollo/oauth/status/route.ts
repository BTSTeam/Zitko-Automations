import { NextResponse } from 'next/server'
import { ensureApolloToken } from '@/lib/apolloRefresh'

export async function GET() {
  const token = await ensureApolloToken().catch(() => null)
  return NextResponse.json({ connected: !!token })
}

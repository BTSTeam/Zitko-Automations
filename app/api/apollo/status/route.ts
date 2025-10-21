// app/api/apollo/status/route.ts
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ connected: false })
}

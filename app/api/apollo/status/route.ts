// app/api/apollo/status/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'       // however you identify the current user
import { db } from '@/lib/db'                     // your Prisma or database client

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ connected: false })

  // Check if Apollo token exists for this user
  const token = await db.oauthToken.findFirst({
    where: { userId: user.id, provider: 'apollo' },
  })

  return NextResponse.json({ connected: !!token })
}

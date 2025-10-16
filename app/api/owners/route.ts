// app/api/owners/route.ts
export const dynamic = 'force-dynamic'   // always fresh from user store
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getUsers } from '@/lib/users' // adjust if your export name differs

type Owner = { id: string; name: string; email: string; phone: string }

export async function GET() {
  try {
    // getUsers should return your user management list
    const users = await getUsers()

    const owners: Owner[] = (users ?? [])
      // tweak this predicate if you use different flags/roles
      .filter((u: any) => u?.active !== false)
      .map((u: any) => ({
        id: String(u.id ?? u._id ?? u.email ?? crypto.randomUUID()),
        name: String(
          u.name ??
          [u.firstName, u.lastName].filter(Boolean).join(' ') ??
          u.email ??
          ''
        ).trim(),
        email: String(u.email ?? ''),
        phone: String(u.phone ?? u.phoneNumber ?? ''),
      }))

    return NextResponse.json({ owners })
  } catch (err) {
    // Don’t fail the page—return empty list
    return NextResponse.json({ owners: [] }, { status: 200 })
  }
}

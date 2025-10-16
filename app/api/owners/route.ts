// app/api/owners/route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
// Import listUsers instead of getUsers.  lib/users.ts does not export getUsers.
import { listUsers } from '@/lib/users';

type Owner = { id: string; name: string; email: string; phone: string };

export async function GET() {
  try {
    // listUsers returns an array of user records
    const users = await listUsers();

    const owners: Owner[] = (users ?? [])
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
      }));

    return NextResponse.json({ owners });
  } catch (err) {
    // Don’t fail the page—return an empty list on error
    return NextResponse.json({ owners: [] }, { status: 200 });
  }
}

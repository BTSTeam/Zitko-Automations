// app/api/apollo/status/route.ts
import { NextResponse } from 'next/server';

// TODO: replace with real user/tenant lookup of stored OAuth tokens
async function isApolloConnectedForCurrentUser(): Promise<boolean> {
  // Example: return !!(await db.tokens.findUnique({ where: { userId, provider: 'apollo' } }))
  return !!process.env.APOLLO_TEST_ACCESS_TOKEN; // placeholder
}

export async function GET() {
  const connected = await isApolloConnectedForCurrentUser();
  return NextResponse.json({ connected });
}

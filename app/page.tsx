// app/page.tsx
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function Home() {
  const session = await getSession()

  // If already authenticated (local or Vincere tokens), send to destination select
  if (session.user?.email || session.tokens?.idToken) {
    redirect('/select')
  }

  redirect('/login')
}

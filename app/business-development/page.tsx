// app/business-development/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function BusinessDevelopmentPage() {
  const session = await getSession()

  if (!session.user?.email && !session.tokens?.idToken) {
    redirect('/login')
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold">ZAWA Business Development</h1>
        <p className="mt-2 text-gray-600">
          This dashboard is coming soon.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/select" className="btn btn-grey">
            Back
          </Link>
          <Link href="/dashboard" className="btn btn-brand">
            Go to Automations
          </Link>
        </div>
      </div>
    </div>
  )
}

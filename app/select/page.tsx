// app/select/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import SelectMascot from './SelectMascot'

export default async function SelectDestinationPage() {
  const session = await getSession()

  if (!session.user?.email && !session.tokens?.idToken) {
    redirect('/login')
  }

  return (
    <div className="flex justify-center pt-6">
      <div className="w-full max-w-5xl px-4">
        {/* Mascot replaces the heading */}
        <div className="flex justify-center mb-8">
          <SelectMascot />
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ZAWA Automations */}
          <Link
            href="/dashboard"
            className="
              group rounded-[28px] border border-gray-200 bg-white
              p-10 min-h-[220px] flex items-center justify-center text-center
              transition hover:shadow-lg hover:-translate-y-[1px]
              hover:border-[#F7941D]
            "
          >
            <div>
              <div
                className="font-semibold"
                style={{ color: '#111827', fontSize: 'clamp(1.25rem, 2.2vw, 2rem)' }}
              >
                ZAWA
              </div>
              <div
                className="mt-2"
                style={{ color: '#111827', fontSize: 'clamp(1rem, 1.6vw, 1.5rem)' }}
              >
                Automations
              </div>
            </div>
          </Link>

          {/* ZAWA Business Development */}
          <Link
            href="/business-development"
            className="
              group rounded-[28px] border border-gray-200 bg-white
              p-10 min-h-[220px] flex items-center justify-center text-center
              transition hover:shadow-lg hover:-translate-y-[1px]
              hover:border-[#F7941D]
            "
          >
            <div>
              <div
                className="font-semibold"
                style={{ color: '#111827', fontSize: 'clamp(1.25rem, 2.2vw, 2rem)' }}
              >
                ZAWA
              </div>
              <div
                className="mt-2"
                style={{ color: '#111827', fontSize: 'clamp(1rem, 1.6vw, 1.5rem)' }}
              >
                Business Development
              </div>
              <div className="mt-4 text-sm text-gray-400">(Coming soon)</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

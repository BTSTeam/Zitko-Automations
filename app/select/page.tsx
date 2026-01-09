// app/select/page.tsx
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export default async function SelectDestinationPage() {
  const session = await getSession()

  if (!session.user?.email && !session.tokens?.idToken) {
    redirect('/login')
  }

  return (
    <div className="flex justify-center pt-6">
      <div className="w-full max-w-5xl px-4">
        {/* Heading */}
        <h1
          className="text-center font-semibold uppercase mb-10"
          style={{
            color: '#3B3E44',
            letterSpacing: '0.5em',
            fontSize: 'clamp(1.5rem, 3.2vw, 2.75rem)',
          }}
        >
          SELECT PLATFORM
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ZAWA Automations */}
          <Link
            href="/dashboard"
            className="
              group
              rounded-[28px]
              border
              border-gray-200
              bg-white
              p-10
              min-h-[220px]
              flex
              items-center
              justify-center
              text-center
              transition
              hover:shadow-lg
              hover:-translate-y-[1px]
              hover:border-[#F7941D]
            "
          >
            <div>
              <div
              className="font-semibold flex items-center justify-center gap-2"
              style={{
                color: '#F7941D',
                fontSize: 'clamp(1.25rem, 2.2vw, 2rem)',
              }}
            >
              {'>'} ZAWA {'<'}
            </div>
              <div
                className="mt-2"
                style={{
                  color: '#3B3E44',
                  fontSize: 'clamp(1rem, 1.6vw, 1.5rem)',
                }}
              >
                Automations
              </div>
            </div>
          </Link>

          {/* ZAWA Business Development */}
          <Link
            href="/business-development"
            className="
              group
              rounded-[28px]
              border
              border-gray-200
              bg-white
              p-10
              min-h-[220px]
              flex
              items-center
              justify-center
              text-center
              transition
              hover:shadow-lg
              hover:-translate-y-[1px]
              hover:border-[#F7941D]
            "
          >
            <div>
              <div
                className="font-semibold flex items-center justify-center gap-2"
                style={{
                  color: '#F7941D',
                  fontSize: 'clamp(1.25rem, 2.2vw, 2rem)',
                }}
              >
                {'>'} ZAWA {'<'}
              </div>
          
              <div
                className="mt-2"
                style={{
                  color: '#3B3E44',
                  fontSize: 'clamp(1rem, 1.6vw, 1.5rem)',
                }}
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

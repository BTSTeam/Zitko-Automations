import './globals.css'
import TopNav from '@/components/TopNav'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Zitko Automations',
  description: 'AI Powered Automation Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav user={{ name: 'Stephen Rosamond', email: 'stephenr@zitko.co.uk' }} />
        <main className="container py-6">{children}</main>
      </body>
    </html>
  )
}

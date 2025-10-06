// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session' // or '@/lib/sessions' if that's your filename
import ClientShell from './ClientShell'

export default async function Page() {
  const session = await getSession()
  if (!session.user?.email) {
    redirect('/login')
  }
  return <ClientShell />
}

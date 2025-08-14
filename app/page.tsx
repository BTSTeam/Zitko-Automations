import Link from 'next/link'

export default function Home() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p>This starter connects to Vincere via OAuth2 (PKCE) and demonstrates an example API call.</p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-2xl px-4 py-2 bg-brand-orange text-white">Login with Vincere</Link>
        <Link href="/test" className="rounded-2xl px-4 py-2 border">Test Vincere Call</Link>
      </div>
    </div>
  )
}

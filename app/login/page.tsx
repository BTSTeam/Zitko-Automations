'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await fetch('/api/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!r.ok) {
        const t = await r.json().catch(() => ({}))
        throw new Error(t?.error || `Login failed (${r.status})`)
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={onSubmit} className="card p-6 w-full max-w-md grid gap-4">
        <h1 className="text-xl font-semibold text-center">Login</h1>

        <div>
          <label className="text-sm text-gray-600">Email</label>
          <input
            type="email"
            className="input mt-1 w-full"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="text-sm text-gray-600">Password</label>
          <input
            type="password"
            className="input mt-1 w-full"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <div className="rounded-xl border p-3 text-sm text-red-600">{error}</div>}

        <button className="btn btn-brand w-full" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="text-center text-sm text-gray-600">
          Or&nbsp;
          <a className="text-brand-orange underline" href="/api/auth/authorize">
            Login with Vincere
          </a>
        </div>
      </form>
    </div>
  )
}

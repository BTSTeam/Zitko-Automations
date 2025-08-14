'use client'

export default function LoginPage() {
  const startLogin = () => { window.location.href = '/api/auth/authorize' }
  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-full max-w-md card p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-full border flex items-center justify-center text-brand-orange font-bold">Z</div>
          <h1 className="text-2xl font-semibold mt-3">Zitko Automations</h1>
          <p className="text-gray-500">AI Powered Automation Platform</p>
        </div>

        <h2 className="text-lg font-semibold mb-1">Sign In</h2>
        <p className="text-sm text-gray-600 mb-4">Enter your credentials to access the platform</p>
        <div className="grid gap-3">
          <input className="input" placeholder="Email" defaultValue="stephenr@zitko.co.uk" />
          <input className="input" placeholder="Password" type="password" defaultValue="•••••••" />
          <button onClick={startLogin} className="btn btn-grey">Sign In</button>
        </div>
      </div>
    </div>
  )
}

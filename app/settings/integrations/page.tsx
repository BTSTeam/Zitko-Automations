'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function IntegrationsPage() {
  const router = useRouter()
  const [apolloConnected, setApolloConnected] = useState(false)
  const [loadingApollo, setLoadingApollo] = useState(false)

  const [jotform, setJotform] = useState('')
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini')
  const [jobId, setJobId] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [payload, setPayload] = useState<any>(null)

  // Apollo connection status
  useEffect(() => {
    fetch('/api/apollo/status')
      .then(r => r.json())
      .then(d => setApolloConnected(!!d.connected))
      .catch(() => setApolloConnected(false))
  }, [])

  const loginWithApollo = () => {
    window.location.href = '/api/apollo/oauth/authorize'
  }

  const disconnectApollo = async () => {
    setLoadingApollo(true)
    try {
      await fetch('/api/apollo/disconnect', { method: 'POST' })
      setApolloConnected(false)
    } finally {
      setLoadingApollo(false)
    }
  }

  const loginWithVincere = () => {
    window.location.href = '/api/auth/authorize'
  }

  const testVincereCall = async () => {
    if (!jobId) {
      setStatus('Enter a Job ID first.')
      return
    }
    setLoading(true)
    setStatus('Calling Vincere…')
    setPayload(null)
    try {
      const r = await fetch(`/api/vincere/position/${encodeURIComponent(jobId)}`)
      const text = await r.text()
      let data: any = null
      try { data = JSON.parse(text) } catch {}
      if (!r.ok) {
        setStatus(`Failed (${r.status}). Check auth & Job ID.`)
        setPayload(data ?? text)
      } else {
        setStatus('Success ✔')
        setPayload(data ?? text)
      }
    } catch (e: any) {
      setStatus(`Error: ${e?.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6">
      <div className="card p-6 grid gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Integration Settings</h1>
          <button
            aria-label="Close"
            onClick={() => router.back()}
            className="w-8 h-8 grid place-items-center rounded-full border text-gray-600 hover:text-gray-900"
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="grid gap-3">
            <h2 className="font-semibold">Vincere</h2>
            <button className="btn btn-brand w-max" onClick={loginWithVincere}>
              🔐 Login with Vincere
            </button>

            <div className="grid gap-2">
              <label className="text-sm text-gray-600">Test Job ID</label>
              <input
                className="input"
                placeholder="e.g. 62940"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              />
              <button className="btn btn-grey w-max" onClick={testVincereCall} disabled={loading}>
                {loading ? 'Testing…' : '🧪 Test Vincere Call'}
              </button>
            </div>

            {status && (
              <div className="mt-2 text-sm">
                <div className="text-gray-700 font-medium mb-1">Status</div>
                <div className="rounded-2xl border p-3">{status}</div>
              </div>
            )}

            {payload && (
              <div className="mt-2 text-sm">
                <div className="text-gray-700 font-medium mb-1">Response</div>
                <pre className="rounded-2xl border p-3 overflow-auto max-h-[400px]">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Apollo section */}
          <div className="grid gap-3">
            <h2 className="font-semibold flex items-center gap-2">
              {/* CASE-SENSITIVE, file lives at /public/Apollo-Logo.png */}
              <img src="/Apollo-Logo.png" alt="Apollo" className="h-6 w-auto" />
              Apollo.io
            </h2>
          
            {apolloConnected ? (
              <>
                <p className="text-sm text-green-600">✅ Connected to Apollo</p>
                <button
                  className="btn btn-grey w-max"
                  onClick={disconnectApollo}
                  disabled={loadingApollo}
                >
                  {loadingApollo ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </>
            ) : (
              <button
                className="btn btn-brand w-max flex items-center gap-2"
                onClick={loginWithApollo}
              >
                <img src="/Apollo-Logo.png" alt="Apollo" className="h-5 w-auto" />
                Login with Apollo
              </button>
            )}

            <div className="mt-4 border-t pt-3">
              <h3 className="font-medium mb-1 text-sm text-gray-700">ChatGPT (OpenAI)</h3>
              <input
                className="input"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                API key is set via environment variables.
              </p>
            </div>

            <div className="mt-4">
              <h3 className="font-medium mb-1 text-sm text-gray-700">JotForm Embed URL</h3>
              <input
                className="input"
                value={jotform}
                onChange={(e) => setJotform(e.target.value)}
                placeholder="https://form.jotform.com/..."
              />
            </div>

            <button className="btn btn-grey w-max mt-3">Save (demo only)</button>
          </div>
        </div>
      </div>
    </div>
  )
}

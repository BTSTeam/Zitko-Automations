'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function IntegrationsPage() {
  const router = useRouter()                      // ✅ here

  // Existing settings
  const [jotform, setJotform] = useState('')
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini')

  // Vincere test bits
  const [jobId, setJobId] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [payload, setPayload] = useState<any>(null)

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
      try { data = JSON.parse(text) } catch { /* keep raw text */ }

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
        {/* Header with Close X */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Integration Settings</h1>
          <button
            aria-label="Close"
            onClick={() => router.back()}            // ✅ this closes and returns
            className="w-8 h-8 grid place-items-center rounded-full border text-gray-600 hover:text-gray-900"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Vincere auth + test */}
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

          {/* Existing sections */}
          <div className="grid gap-4">
            <div>
              <h2 className="font-semibold mb-2">JotForm</h2>
              <label className="text-sm text-gray-600">JotForm Embed URL</label>
              <input
                className="input mt-1"
                value={jotform}
                onChange={e => setJotform(e.target.value)}
                placeholder="https://form.jotform.com/..."
              />
              <p className="text-sm text-gray-500 mt-2">
                Paste your JotForm's direct link here to embed it on the Sourcing tab.
              </p>
            </div>

            <div>
              <h2 className="font-semibold mb-2">ChatGPT (OpenAI)</h2>
              <label className="text-sm text-gray-600">Model</label>
              <input
                className="input mt-1"
                value={openaiModel}
                onChange={e => setOpenaiModel(e.target.value)}
              />
              <p className="text-sm text-gray-500 mt-2">
                API key is set in environment variables on Vercel.
              </p>
            </div>

            <button className="btn btn-grey w-max">Save (demo only)</button>
          </div>
        </div>
      </div>
    </div>
  )
}

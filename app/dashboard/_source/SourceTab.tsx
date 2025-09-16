'use client'

import { useEffect, useState } from 'react'

type SourceMode = 'candidates' | 'companies'

/**
 * If you render without props it defaults to 'candidates'.
 * You can also do: <SourceTab mode="companies" />
 */
export default function SourceTab({ mode: initialMode = 'candidates' }: { mode?: SourceMode }) {
  const [mode, setMode] = useState<SourceMode>(initialMode)

  if (mode === 'companies') {
    return (
      <div className="card p-6">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏗️</div>
          <h3 className="text-xl font-semibold mb-2">Building In Process…</h3>
          <p className="text-gray-600">This Companies sourcing page will host a similar embedded form soon.</p>
        </div>
      </div>
    )
  }

  // Candidates (existing JotForm embed)
  const jotformUrl = process.env.NEXT_PUBLIC_JOTFORM_URL || ''
  const hasUrl = jotformUrl.length > 0
  const formId = hasUrl ? (jotformUrl.match(/\/(\d{10,})(?:$|[/?#])/i)?.[1] ?? null) : null
  const [height, setHeight] = useState<number>(900)
  const [iframeKey, setIframeKey] = useState(0)
  const refreshForm = () => setIframeKey(k => k + 1)

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!formId) return
      if (typeof e.data !== 'string') return
      const parts = e.data.split(':')
      if (parts[0] === 'setHeight') {
        const newH = Number(parts[1])
        if (!Number.isNaN(newH) && newH > 0) setHeight(newH + 20)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [formId])

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="m-0">Complete the form below to source relevant candidates directly to your email inbox.</p>
        {hasUrl && <button className="btn btn-brand" onClick={refreshForm} title="Reload form">Refresh</button>}
      </div>

      {!hasUrl ? (
        <div className="border-2 border-dashed rounded-2xl p-10 text-center text-gray-500">
          <div className="mb-2 text-5xl">🧾</div>
          <div className="font-semibold mb-2">JotForm Integration</div>
          <p className="mb-2">
            Add your form URL in the Vercel env var <code>NEXT_PUBLIC_JOTFORM_URL</code> and redeploy.
          </p>
          <p className="text-xs break-all">Example: https://form.jotform.com/123456789012345</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border">
          <iframe
            key={iframeKey}
            id={formId ? `JotFormIFrame-${formId}` : 'JotFormIFrame'}
            title="JotForm"
            src={jotformUrl}
            className="w-full"
            style={{ height }}
            scrolling="no"
            frameBorder={0}
            allow="clipboard-write; fullscreen"
          />
        </div>
      )}
    </div>
  )
}


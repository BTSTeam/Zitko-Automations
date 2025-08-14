'use client'
import { useState } from 'react'

export default function IntegrationsPage() {
  const [jotform, setJotform] = useState('')
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini')
  return (
    <div className="card p-6 grid gap-6">
      <h1 className="text-xl font-semibold">Integration Settings</h1>
      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-2">JotForm</h2>
          <label className="text-sm text-gray-600">JotForm Embed URL</label>
          <input className="input mt-1" value={jotform} onChange={e=>setJotform(e.target.value)} placeholder="https://form.jotform.com/..." />
          <p className="text-sm text-gray-500 mt-2">Paste your JotForm's direct link here to embed it on the Sourcing tab.</p>
        </div>
        <div>
          <h2 className="font-semibold mb-2">ChatGPT (OpenAI)</h2>
          <label className="text-sm text-gray-600">Model</label>
          <input className="input mt-1" value={openaiModel} onChange={e=>setOpenaiModel(e.target.value)} />
          <p className="text-sm text-gray-500 mt-2">API key is set in environment variables on Vercel.</p>
        </div>
      </div>
      <button className="btn btn-grey w-max">Save (demo only)</button>
    </div>
  )
}

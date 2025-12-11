'use client'

import React from 'react'

export default function WooTab() {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 py-3 border-b bg-white">
        <h2 className="text-xl font-semibold">Woo Matching</h2>
        <p className="text-sm text-gray-500">
          Powered by Woo – embedded directly inside your dashboard.
        </p>
      </div>

      <div className="flex-1 overflow-hidden">
        <iframe
          src="https://agents.woo.io/ai-sourcer-agent"
          className="w-full h-full border-0"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  )
}

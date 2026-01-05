'use client'

export default function WooTab() {
  return (
    <div className="w-full h-full flex flex-col">
      
      {/* Header */}
      <div className="px-4 py-3 border-b bg-white flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Woo Matching</h2>
          <p className="text-sm text-gray-500">Powered by Woo.</p>
        </div>

        <p className="text-xs text-gray-400 text-right max-w-xs">
          If no entry is being shown, please authorize via{' '}
          <a
            href="https://agents.woo.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#F7941D] hover:underline"
          >
            this link
          </a>
          .
        </p>
      </div>

      {/* Woo iframe */}
      <iframe
        src="https://agents.woo.io/ai-sourcer-agent"
        style={{
          width: '111%',
          height: 'calc(100vh - 180px)',
          transform: 'scale(0.9)',
          transformOrigin: '0 0',
          border: '0',
        }}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </div>
  )
}


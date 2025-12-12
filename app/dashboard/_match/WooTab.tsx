'use client'

export default function WooTab() {
  return (
    <div className="w-full h-full flex flex-col">
      
      <div className="px-4 py-3 border-b bg-white">
        <h2 className="text-xl font-semibold">Woo Matching</h2>
        <p className="text-sm text-gray-500">Powered by Woo.</p>
      </div>

      <iframe
        src="https://agents.woo.io/ai-sourcer-agent"
        style={{
          width: '111%',                
          height: 'calc(100vh - 180px)',
          transform: 'scale(0.9)',      
          transformOrigin: '0 0',       
          border: '0'
        }}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </div>
  )
}

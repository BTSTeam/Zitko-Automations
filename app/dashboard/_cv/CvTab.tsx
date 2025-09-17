{/* Raw JSON Data — small, below Additional Information */}
<div className="mt-2 border rounded-xl p-2 bg-gray-50">
  <div className="text-[11px] font-semibold text-gray-600 mb-1">Raw JSON Data (debug)</div>

  {/* Candidate Data (full JSON) */}
  <div className="border rounded-lg mb-2">
    <div className="flex items-center justify-between px-2 py-1">
      <div className="text-[11px] font-medium">Candidate Data</div>
      <button
        type="button"
        className="text-[11px] text-gray-500 underline"
        onClick={() => toggle('rawCandidate')}
      >
        {open.rawCandidate ? 'Hide' : 'Show'}
      </button>
    </div>
    {open.rawCandidate && (
      <pre className="text-[10px] leading-tight bg-white border-t rounded-b-lg p-2 max-h-64 overflow-auto">
{JSON.stringify(rawCandidate, null, 2)}
      </pre>
    )}
  </div>

  {/* Work Experience (full JSON array) */}
  <div className="border rounded-lg mb-2">
    <div className="flex items-center justify-between px-2 py-1">
      <div className="text-[11px] font-medium">Work Experience</div>
      <button
        type="button"
        className="text-[11px] text-gray-500 underline"
        onClick={() => toggle('rawWork')}
      >
        {open.rawWork ? 'Hide' : 'Show'}
      </button>
    </div>
    {open.rawWork && (
      <pre className="text-[10px] leading-tight bg-white border-t rounded-b-lg p-2 max-h-64 overflow-auto">
{JSON.stringify(rawWork, null, 2)}
      </pre>
    )}
  </div>

  {/* Education Details (full JSON array) */}
  <div className="border rounded-lg">
    <div className="flex items-center justify-between px-2 py-1">
      <div className="text-[11px] font-medium">Education Details</div>
      <button
        type="button"
        className="text-[11px] text-gray-500 underline"
        onClick={() => toggle('rawEdu')}
      >
        {open.rawEdu ? 'Hide' : 'Show'}
      </button>
    </div>
    {open.rawEdu && (
      <pre className="text-[10px] leading-tight bg-white border-t rounded-b-lg p-2 max-h-64 overflow-auto">
{JSON.stringify(rawEdu, null, 2)}
      </pre>
    )}
  </div>
</div>

'use client'

import { useState } from 'react'

const CONSULTANTS = [
  { name: "Aaron McDonald", division: "IRE - Permanent", id: 29024 },
  { name: "Craig Hickman", division: "UK - Permanent", id: 29051 },
  { name: "Ellie Kendal", division: "UK - Contracting", id: 28981 },
  { name: "Hannah Reilly", division: "US", id: 29006 },
  { name: "Helen Parsons", division: "UK - Contracting", id: 29014 },
  { name: "Karl Dowd", division: "IRE - Contracting", id: 33092 },
  { name: "Lauren Pocknell", division: "UK - Contracting", id: 29002 },
  { name: "Michelle Siwiec", division: "US", id: 29041 },
  { name: "Oliver Brookes", division: "US", id: 29034 },
  { name: "Sam Petch", division: "UK - Permanent", id: 33158 },
  { name: "Steve Gray", division: "UK - Permanent", id: 28982 },
  { name: "Victoria Geoghegan", division: "UK - Permanent", id: 29025 },
  { name: "Yvonne Mills", division: "US", id: 29036 }
]

const DIVISIONS = [
  "IRE - Contracting",
  "IRE - Permanent",
  "UK - Contracting",
  "UK - Perm",
  "US"
]

export default function DataTab() {
  const [consultant, setConsultant] = useState("")
  const [division, setDivision] = useState("")
  const [period, setPeriod] = useState("CURRENT_MONTH")
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const runQuery = async () => {
    setLoading(true)
    setResults([])

    let ids: number[] = []

    if (consultant) {
      const c = CONSULTANTS.find(c => c.name === consultant)
      if (c) ids.push(c.id)
    } else if (division) {
      ids = CONSULTANTS.filter(c => c.division === division).map(c => c.id)
    }

    const allResults: any[] = []
    for (const id of ids) {
      const res = await fetch(`/api/vincere/report/statistics?consultant_id=${id}&period=${period}`)
      const json = await res.json()
      allResults.push({ consultantId: id, json })
    }

    setResults(allResults)
    setLoading(false)
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto p-6 flex flex-col gap-6">

      {/* TOP PANEL */}
      <div className="w-full border rounded-xl p-4 bg-white flex gap-4 items-end">

        {/* CONSULTANT */}
        <div className="flex-1">
          <label className="text-sm font-medium">Consultant</label>
          <select
            value={consultant}
            onChange={e => { setConsultant(e.target.value); setDivision("") }}
            className="border w-full rounded px-3 py-2"
          >
            <option value="">-- Select Consultant --</option>
            {CONSULTANTS.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* DIVISION */}
        <div className="flex-1">
          <label className="text-sm font-medium">Division</label>
          <select
            value={division}
            onChange={e => { setDivision(e.target.value); setConsultant("") }}
            className="border w-full rounded px-3 py-2"
          >
            <option value="">-- Select Division --</option>
            {DIVISIONS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* PERIOD */}
        <div>
          <label className="text-sm font-medium">Period</label>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border w-full rounded px-3 py-2"
          >
            <option value="CURRENT_MONTH">Current Month</option>
            <option value="LAST_MONTH">Last Month</option>
          </select>
        </div>

        {/* SUBMIT */}
        <button
          onClick={runQuery}
          disabled={loading}
          className="bg-[#F7941D] text-white rounded px-4 py-2 font-medium"
        >
          {loading ? "Loading..." : "Get Statistics"}
        </button>
      </div>

      {/* RESULTS PANEL */}
      <div className="w-full border rounded-xl p-4 bg-white h-[500px] overflow-auto">
        <pre className="text-xs whitespace-pre-wrap">
          {results.length === 0 ? "No data yet..." : JSON.stringify(results, null, 2)}
        </pre>
      </div>

    </div>
  )
}

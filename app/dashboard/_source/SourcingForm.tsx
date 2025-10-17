'use client'

import { useState } from 'react'

type SourceMode = 'candidates' | 'companies'

interface SourcingFormProps {
  /** Determines whether this form is searching for candidates or companies */
  mode: SourceMode
  /** Callback invoked with the search body when the user submits the form */
  onSearch: (body: any) => void
}

/** The allowed market segment values for company searches */
const MARKET_OPTIONS = [
  'B2B',
  'B2C',
  'B2B2C',
  'E-commerce',
  'Finetech',
  'D2C',
  'Non-Profit',
  'SaaS',
  'Consulting',
  'Services',
  'Retail',
]

/**
 * A reusable multi-value input component.
 *
 * Users can type a value and press Enter to add it as a chip.
 * Chips display the current list of values and provide a button to remove them.
 * Optional suggestions may be provided to restrict allowable values.
 */
function ChipsInput({
  label,
  values,
  setValues,
  placeholder,
  suggestions,
}: {
  label: string
  values: string[]
  setValues: (vals: string[]) => void
  placeholder: string
  suggestions?: string[]
}) {
  const [input, setInput] = useState('')

  const addValue = () => {
    const raw = input.trim()
    if (!raw) return
    let value = raw

    // If suggestions are provided, ensure the entry matches one of them
    if (suggestions) {
      const match = suggestions.find(
        (opt) => opt.toLowerCase() === raw.toLowerCase(),
      )
      if (!match) {
        // Invalid entry; ignore
        setInput('')
        return
      }
      value = match
    }

    // Avoid duplicates (case-insensitive)
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setValues([...values, value])
    }
    setInput('')
  }

  const removeValue = (idx: number) => {
    const updated = [...values]
    updated.splice(idx, 1)
    setValues(updated)
  }

  return (
    <div className="flex flex-col">
      <label className="font-medium mb-1">{label}</label>
      <div className="flex flex-wrap gap-2 border rounded px-2 py-1">
        {values.map((val, idx) => (
          <span
            key={`${val}-${idx}`}
            className="flex items-center bg-gray-200 rounded-full px-2 py-1 text-sm"
          >
            {val}
            <button
              type="button"
              onClick={() => removeValue(idx)}
              className="ml-1 text-xs font-bold focus:outline-none"
              aria-label={`Remove ${val}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addValue()
            }
          }}
          className="flex-grow min-w-[120px] px-1 py-1 outline-none"
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}

/**
 * The main sourcing form used for both candidate and company searches.
 * Fields are shown/hidden based on the selected mode.
 */
export default function SourcingForm({ mode, onSearch }: SourcingFormProps) {
  // Common fields
  const [locations, setLocations] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])

  // Candidate-only fields
  const [permanent, setPermanent] = useState(true)
  const [titles, setTitles] = useState<string[]>([])

  // Company-only fields
  const [marketSegments, setMarketSegments] = useState<string[]>([])
  const [jobPostings, setJobPostings] = useState(false)
  const [rapidGrowth, setRapidGrowth] = useState(false)

  /**
   * Build the search body based on current form state and delegate to onSearch.
   * For contract searches, ensure "IR35" and "pay rate" are included in keywords.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Copy keywords; add auto keywords for contract if needed
    let kw = [...keywords]
    if (mode === 'candidates' && !permanent) {
      ;['IR35', 'pay rate'].forEach((autoKw) => {
        if (!kw.some((v) => v.toLowerCase() === autoKw.toLowerCase())) {
          kw.push(autoKw)
        }
      })
    }

    if (mode === 'candidates') {
      onSearch({
        titles,
        locations,
        keywords: kw,
        permanent,
      })
    } else {
      onSearch({
        locations,
        keywords: kw,
        marketSegments,
        jobPostings,
        rapidGrowth,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Location input */}
      <ChipsInput
        label="Location(s)"
        values={locations}
        setValues={setLocations}
        placeholder="Add a location and press Enter"
      />

      {/* Keywords input */}
      <ChipsInput
        label="Keyword(s)"
        values={keywords}
        setValues={setKeywords}
        placeholder="Add a keyword and press Enter"
      />

      {/* Candidate-specific fields */}
      {mode === 'candidates' && (
        <>
          {/* Permanent vs Contract toggle */}
          <div className="flex flex-col">
            <label className="font-medium mb-1">Employment Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="employment-type"
                  className="radio"
                  checked={permanent}
                  onChange={() => setPermanent(true)}
                />
                Permanent
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="employment-type"
                  className="radio"
                  checked={!permanent}
                  onChange={() => setPermanent(false)}
                />
                Contract
              </label>
            </div>
          </div>

          {/* Job titles */}
          <ChipsInput
            label="Job Title(s)"
            values={titles}
            setValues={setTitles}
            placeholder="Add a job title and press Enter"
          />
        </>
      )}

      {/* Company-specific fields */}
      {mode === 'companies' && (
        <>
          {/* Market segments with suggestions */}
          <ChipsInput
            label="Market Segment(s)"
            values={marketSegments}
            setValues={setMarketSegments}
            placeholder="Add a segment and press Enter"
            suggestions={MARKET_OPTIONS}
          />

          {/* Job postings and rapid growth checkboxes */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox"
                checked={jobPostings}
                onChange={(e) => setJobPostings(e.target.checked)}
              />
              Companies with active job postings
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox"
                checked={rapidGrowth}
                onChange={(e) => setRapidGrowth(e.target.checked)}
              />
              Rapid growth companies
            </label>
          </div>
        </>
      )}

      {/* Submit button */}
      <div className="flex justify-end">
        <button type="submit" className="btn btn-brand">
          Search
        </button>
      </div>
    </form>
  )
}

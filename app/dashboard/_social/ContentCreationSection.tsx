'use client'

import React, { useEffect, useRef, useState } from 'react'

/* ========= shared chip + multiselect helpers ========= */

function Chip({
  children,
  onRemove,
}: {
  children: string
  onRemove: (e?: React.MouseEvent) => void
}) {
  return (
    <span className="shrink-0 inline-flex items-center gap-2 h-7 rounded-full bg-gray-100 px-3 text-sm">
      <span className="truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full w-5 h-5 grid place-items-center hover:bg-gray-200"
        title="Remove"
      >
        ×
      </button>
    </span>
  )
}

function MultiSelect({
  options,
  values,
  setValues,
  placeholder = 'Select…',
}: {
  options: string[]
  values: string[]
  setValues: (v: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  function toggleOpt(opt: string) {
    const next = values.includes(opt)
      ? values.filter((o) => o !== opt)
      : [...values, opt]
    setValues(next)
  }

  function removeChip(opt: string) {
    setValues(values.filter((v) => v !== opt))
  }

  return (
    <div ref={ref} className="relative rounded-xl border h-10 px-3">
      <button
        type="button"
        className="w-full h-full text-left flex items-center justify-between"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto mr-2">
          {values.length ? (
            values.map((v) => (
              <Chip
                key={v}
                onRemove={(e) => {
                  e?.stopPropagation()
                  removeChip(v)
                }}
              >
                {v}
              </Chip>
            ))
          ) : (
            <span className="text-sm text-gray-400">{placeholder}</span>
          )}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-xl shadow-sm max-h-60 overflow-y-auto text-sm">
          {options.map((opt) => (
            <label key={opt} className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer gap-2">
              <input
                type="checkbox"
                checked={values.includes(opt)}
                onChange={() => toggleOpt(opt)}
                className="appearance-none h-4 w-4 rounded border border-gray-300 grid place-content-center checked:bg-orange-500"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ========= constants ========= */

const REGIONS = ['UK', 'Ireland', 'USA', 'APAC']
const CONTENT_THEMES = [
  'Own experience / story',
  'Industry tips & how-tos',
  'Job market update',
  'Holiday / seasonal',
  'Polls & questions',
  'Viral trend commentary',
  'Salaries',
]
const TONES = ['Professional', 'Conversational', 'Playful', 'Bold', 'Storytelling']
const AUDIENCES = ['Candidates', 'Clients', 'Both']
const FORMATS = ['Single post', 'Short series (3 posts)', 'Full week plan (Mon–Fri, 5 posts)']
const CONTENT_LENGTHS = ['Short', 'Medium', 'Long']
const PLATFORMS = ['LinkedIn', 'Facebook', 'TikTok', 'Instagram']
const PERSPECTIVES = ['Male', 'Female']
const HOOK_OPTIONS = ['Yes', 'No']

const FORMAT_FULL_WEEK = 'Full week plan (Mon–Fri, 5 posts)'

/* ========= main component ========= */

export default function ContentCreationSection() {
  const [regions, setRegions] = useState<string[]>([])
  const [themes, setThemes] = useState<string[]>([])
  const [tones, setTones] = useState<string[]>([])
  const [audiences, setAudiences] = useState<string[]>([])
  const [formats, setFormats] = useState<string[]>([])
  const [lengths, setLengths] = useState<string[]>([])
  const [platforms, setPlatforms] = useState<string[]>([])
  const [perspective, setPerspective] = useState<string[]>([])
  const [includeHook, setIncludeHook] = useState<string[]>([])
  const [customTopic, setCustomTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState('')

  const ownExperienceSelected = themes.includes('Own experience / story')

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    setResult('')

    try {
      const res = await fetch('/api/social/content-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: regions[0] ?? null,
          audience: audiences[0] ?? null,
          topics: themes,
          customTopic: ownExperienceSelected ? customTopic : '',
          tone: tones[0] ?? null,
          postType: formats[0] ?? null,
          contentLength: lengths[0] ?? null,
          platforms,
          perspective: perspective[0] ?? null,
          includeHook: includeHook[0] === 'Yes',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Request failed')

      setResult(json?.content || 'No content returned.')
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    await navigator.clipboard.writeText(result)
  }

  return (
    <div className="space-y-4 mt-6">
      <div className="rounded-2xl border bg-white p-4 space-y-4">
        <form onSubmit={handleGenerate} className="space-y-4">
          <MultiSelect options={REGIONS} values={regions} setValues={setRegions} placeholder="Region" />
          <MultiSelect options={PLATFORMS} values={platforms} setValues={setPlatforms} placeholder="Platforms" />
          <MultiSelect options={CONTENT_THEMES} values={themes} setValues={setThemes} placeholder="Content themes" />
          <MultiSelect options={TONES} values={tones} setValues={setTones} placeholder="Tone" />
          <MultiSelect options={AUDIENCES} values={audiences} setValues={setAudiences} placeholder="Audience" />
          <MultiSelect options={FORMATS} values={formats} setValues={setFormats} placeholder="Post format" />
          <MultiSelect options={CONTENT_LENGTHS} values={lengths} setValues={setLengths} placeholder="Content length" />
          <MultiSelect options={PERSPECTIVES} values={perspective} setValues={setPerspective} placeholder="Perspective" />
          <MultiSelect options={HOOK_OPTIONS} values={includeHook} setValues={setIncludeHook} placeholder="Include hook?" />

          <textarea
            className="w-full rounded-xl border px-3 py-2 text-sm min-h-[80px]"
            placeholder="Custom topic / experience"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            disabled={!ownExperienceSelected}
          />

          <button type="submit" disabled={loading} className="rounded-full bg-orange-500 text-white px-5 py-2">
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <button onClick={handleCopy} disabled={!result} className="mb-2 text-xs bg-gray-100 px-3 py-1 rounded-full">
          Copy
        </button>
        <div className="text-sm whitespace-pre-wrap">{error || result}</div>
      </div>
    </div>
  )
}

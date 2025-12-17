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
    const next = values.includes(opt) ? values.filter((o) => o !== opt) : [...values, opt]
    setValues(next)
  }

  function removeChip(opt: string) {
    setValues(values.filter((v) => v !== opt))
  }

  return (
    <div ref={ref} className="relative rounded-xl border h-10 px-3 bg-white">
      <button
        type="button"
        className="w-full h-full text-left flex items-center justify-between"
        onClick={() => setOpen((o) => !o)}
        title={values.length ? `${values.length} selected` : undefined}
      >
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto mr-2">
          {values.length ? (
            values.map((v) => (
              <span key={v} className="shrink-0">
                <Chip
                  onRemove={(e) => {
                    e?.stopPropagation()
                    removeChip(v)
                  }}
                >
                  {v}
                </Chip>
              </span>
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
            <label
              key={opt}
              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={values.includes(opt)}
                onChange={() => toggleOpt(opt)}
                className="appearance-none h-4 w-4 rounded border border-gray-300 grid place-content-center
                           checked:bg-orange-500
                           before:content-[''] before:hidden checked:before:block
                           before:w-2.5 before:h-2.5
                           before:[clip-path:polygon(14%_44%,0_59%,39%_100%,100%_18%,84%_4%,39%_72%)]
                           before:bg-white"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ========= option sets ========= */

const REGIONS = ['UK', 'Ireland', 'USA', 'APAC']
const PERSPECTIVES = ['Male', 'Female']

const CONTENT_THEMES = [
  'Own experience / story',
  'Industry tips & how-tos',
  'Job market update',
  'Holiday / seasonal',
  'Viral trend commentary',
  'Salaries',
]

const AUDIENCES = ['Candidates', 'Clients', 'Both']
const TONES = ['Professional', 'Conversational', 'Playful', 'Bold', 'Storytelling']

const FORMATS = ['Single post', 'Poll', 'Short series (3 posts)', 'Full week plan (Mon–Fri, 5 posts)']
const HOOK_OPTIONS = ['Yes', 'No']

/* ========= main component ========= */

export default function ContentCreationSection() {
  const [regions, setRegions] = useState<string[]>([])
  const [perspectives, setPerspectives] = useState<string[]>([])
  const [themes, setThemes] = useState<string[]>([])
  const [audiences, setAudiences] = useState<string[]>([])
  const [tones, setTones] = useState<string[]>([])
  const [formats, setFormats] = useState<string[]>([])
  const [includeHook, setIncludeHook] = useState<string[]>([])

  const [customTopic, setCustomTopic] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')

  const ownExperienceSelected = themes.includes('Own experience / story')

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    setResult('')

    const payload = {
      region: regions[0] ?? null,
      perspective: perspectives[0] ?? null,
      topics: themes,
      audience: audiences[0] ?? null,
      tone: tones[0] ?? null,
      postType: formats[0] ?? null,
      includeHook: includeHook[0] === 'Yes',
      customTopic: ownExperienceSelected ? customTopic : '',
    }

    try {
      const res = await fetch('/api/social/content-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`)

      setResult(typeof json?.content === 'string' ? json.content : 'No content returned.')
    } catch (err: any) {
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4 mt-6">
      {/* Panel 1 – controls */}
      <div className="rounded-2xl border bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-semibold">Content Creation</h3>
        </div>

        <div className="p-4 pt-0">
          <form onSubmit={handleGenerate}>
            {/* Shared grid so rows align across columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-5 gap-3 md:gap-x-4 items-start">
              {/* LEFT column (order unchanged) */}
              <div className="md:col-start-1 md:row-start-1">
                <MultiSelect options={REGIONS} values={regions} setValues={setRegions} placeholder="Region" />
              </div>

              <div className="md:col-start-1 md:row-start-2">
                <MultiSelect
                  options={PERSPECTIVES}
                  values={perspectives}
                  setValues={setPerspectives}
                  placeholder="Perspective"
                />
              </div>

              <div className="md:col-start-1 md:row-start-3">
                <MultiSelect
                  options={CONTENT_THEMES}
                  values={themes}
                  setValues={setThemes}
                  placeholder="Content themes"
                />
              </div>

              <div className="md:col-start-1 md:row-start-4">
                <MultiSelect options={AUDIENCES} values={audiences} setValues={setAudiences} placeholder="Audience" />
              </div>

              <div className="md:col-start-1 md:row-start-5">
                <MultiSelect options={TONES} values={tones} setValues={setTones} placeholder="Tone" />
              </div>

              {/* RIGHT column aligned to LEFT rows */}
              <div className="md:col-start-2 md:row-start-1">
                <MultiSelect
                  options={HOOK_OPTIONS}
                  values={includeHook}
                  setValues={setIncludeHook}
                  placeholder="Include a hook"
                />
              </div>

              {/* Post format aligned with Perspective */}
              <div className="md:col-start-2 md:row-start-2">
                <MultiSelect options={FORMATS} values={formats} setValues={setFormats} placeholder="Post format" />
              </div>

              {/* Free type aligned with Content themes, ends at Audience */}
              <div className="md:col-start-2 md:row-start-3 md:row-span-2">
                <textarea
                  className={`w-full h-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-[#F7941D]
                    text-xs leading-relaxed
                    ${!ownExperienceSelected ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white'}`}
                  placeholder={
                    ownExperienceSelected
                      ? 'Custom topic / own experience & context'
                      : "Select 'Own experience / story' to enable this field"
                  }
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  disabled={!ownExperienceSelected}
                />
              </div>

              {/* Generate aligned with Tone, far right */}
              <div className="md:col-start-2 md:row-start-5 flex items-center justify-end">
                <button
                  type="submit"
                  className="h-10 rounded-full bg-orange-500 text-white px-10 text-sm font-semibold hover:opacity-90 disabled:opacity-50 min-w-[220px]"
                  disabled={loading}
                >
                  {loading ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Panel 2 – output */}
      <div className="rounded-2xl border bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-semibold">Generated ideas</h3>
          <div className="flex items-center gap-2">
            {loading && <span className="text-xs text-gray-500">Thinking…</span>}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!result}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                result ? 'bg-gray-100 text-gray-800 hover:bg-gray-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Copy
            </button>
          </div>
        </div>

        <div className="p-4 pt-0 min-h-[260px]">
          {error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !result && !loading ? (
            <p className="text-sm text-gray-500">
              Choose your options above and click <strong>Generate</strong> to create content.
            </p>
          ) : (
            <div className="rounded-xl border px-3 py-3 text-sm whitespace-pre-wrap leading-relaxed bg-white">
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

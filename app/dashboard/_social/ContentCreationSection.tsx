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
  highlight = false,
}: {
  options: string[]
  values: string[]
  setValues: (v: string[]) => void
  placeholder?: string
  highlight?: boolean
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
    <div
      ref={ref}
      className={[
        'relative rounded-xl h-10 px-3 bg-white border',
        highlight ? 'border-[#F7941D] ring-1 ring-[#F7941D]/20' : 'border-gray-200',
      ].join(' ')}
    >
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

const PLATFORM_OPTIONS = ['LinkedIn', 'Facebook', 'TikTok', 'Instagram']
const CONTENT_LENGTHS = ['Short', 'Medium', 'Long']
const CTA_OPTIONS = ['Yes', 'No']

/* ========= helpers ========= */

function splitIntoOptions(text: string): Array<{ title: string; body: string; full: string }> {
  const t = (text || '').trim()
  if (!t) return []

  const norm = t.replace(/\r\n/g, '\n')

  // Matches:
  // "Option 1\n", "Option 1:\n", "\nOption 2\n" etc.
  const re = /(^|\n)\s*(Option\s*\d+)\s*:?\s*\n/gi

  const hits: Array<{ idx: number; title: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(norm)) !== null) {
    hits.push({ idx: m.index + (m[1] ? m[1].length : 0), title: (m[2] || '').trim() })
  }

  if (!hits.length) return [{ title: 'Result', body: norm, full: norm }]

  const out: Array<{ title: string; body: string; full: string }> = []
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx
    const end = i + 1 < hits.length ? hits[i + 1].idx : norm.length
    const block = norm.slice(start, end).trim()
    const title = hits[i].title
    const body = block.replace(new RegExp(`^${title}\\s*:??\\s*\\n?`, 'i'), '').trim()
    out.push({ title, body, full: `${title}\n${body}`.trim() })
  }
  return out
}

/* ========= main component ========= */

export default function ContentCreationSection() {
  const [controlsOpen, setControlsOpen] = useState(true)

  const [regions, setRegions] = useState<string[]>([])
  const [perspectives, setPerspectives] = useState<string[]>([])
  const [themes, setThemes] = useState<string[]>([])
  const [audiences, setAudiences] = useState<string[]>([])
  const [tones, setTones] = useState<string[]>([])
  const [formats, setFormats] = useState<string[]>([])
  const [platforms, setPlatforms] = useState<string[]>([])
  const [contentLengths, setContentLengths] = useState<string[]>([])
  const [callToAction, setCallToAction] = useState<string[]>([])

  const [customTopic, setCustomTopic] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')

  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const ownExperienceSelected = themes.includes('Own experience / story')

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault()
    setControlsOpen(false)
    setLoading(true)
    setError(null)
    setResult('')
    setCopiedKey(null)

    const payload = {
      region: regions[0] ?? null,
      perspective: perspectives[0] ?? null,
      topics: themes,
      customTopic: ownExperienceSelected ? customTopic : '',
      audience: audiences[0] ?? null,
      tone: tones[0] ?? null,
      postType: formats[0] ?? null,
      platform: platforms[0] ?? null,
      contentLength: contentLengths[0] ?? null,
      callToAction: callToAction[0] === 'Yes',
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

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1200)
    } catch {
      // ignore
    }
  }

  const options = splitIntoOptions(result)

  return (
    <div className="space-y-4 mt-6">
      {/* Panel 1 – controls */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setControlsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3"
          aria-expanded={controlsOpen}
        >
          <h3 className="font-semibold">Content Creation</h3>
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={controlsOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
          >
            <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
          </svg>
        </button>

        {controlsOpen && (
          <div className="p-4 pt-0">
            <form onSubmit={handleGenerate}>
              <div className="relative grid grid-cols-1 md:grid-cols-2 md:grid-rows-[40px_40px_40px_40px_40px_40px_40px] gap-3 md:gap-x-4">
                {/* LEFT column */}
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

                <div className="md:col-start-1 md:row-start-3 relative">
                  <MultiSelect
                    options={CONTENT_THEMES}
                    values={themes}
                    setValues={setThemes}
                    placeholder="Content themes"
                    highlight={ownExperienceSelected}
                  />

                  {/* connector line (ONLY this one) */}
                  {ownExperienceSelected && (
                    <span className="hidden md:block pointer-events-none absolute top-1/2 right-[-20px] w-[20px] h-px bg-[#F7941D]" />
                  )}
                </div>

                <div className="md:col-start-1 md:row-start-4">
                  <MultiSelect options={AUDIENCES} values={audiences} setValues={setAudiences} placeholder="Audience" />
                </div>

                <div className="md:col-start-1 md:row-start-5">
                  <MultiSelect options={TONES} values={tones} setValues={setTones} placeholder="Tone" />
                </div>

                <div className="md:col-start-1 md:row-start-6">
                  <MultiSelect options={FORMATS} values={formats} setValues={setFormats} placeholder="Post format" />
                </div>

                <div className="md:col-start-1 md:row-start-7">
                  <MultiSelect
                    options={PLATFORM_OPTIONS}
                    values={platforms}
                    setValues={setPlatforms}
                    placeholder="Platform"
                  />
                </div>

                {/* RIGHT column */}
                <div className="md:col-start-2 md:row-start-1">
                  <MultiSelect
                    options={CTA_OPTIONS}
                    values={callToAction}
                    setValues={setCallToAction}
                    placeholder="Call to action"
                  />
                </div>

                <div className="md:col-start-2 md:row-start-2">
                  <MultiSelect
                    options={CONTENT_LENGTHS}
                    values={contentLengths}
                    setValues={setContentLengths}
                    placeholder="Content length"
                  />
                </div>

                {/* Free type spans Content themes -> Post format (rows 3-6) */}
                <div className="md:col-start-2 md:row-start-3 md:row-span-4 relative min-h-0 self-stretch">
                  <textarea
                    className={[
                      'w-full h-full min-h-0 resize-none rounded-xl border px-3 py-2 outline-none',
                      'focus:ring-1 focus:ring-[#F7941D] text-xs leading-relaxed',
                      ownExperienceSelected
                        ? 'bg-white border-[#F7941D] ring-1 ring-[#F7941D]/20'
                        : 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200',
                    ].join(' ')}
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

                {/* Generate aligned with Platform (row 7) */}
                <div className="md:col-start-2 md:row-start-7 flex items-center justify-end">
                  <button
                    type="submit"
                    className="h-10 rounded-full bg-orange-500 text-white px-10 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                    disabled={loading}
                  >
                    {loading ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Panel 2 – output */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-semibold">Generated ideas</h3>
        </div>

        <div className="p-4 pt-0">
          {error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !result && !loading ? (
            <p className="text-sm text-gray-500">
              Choose your options above and click <strong>Generate</strong> to create content.
            </p>
          ) : loading ? (
            <div className="text-sm text-gray-500">Thinking…</div>
          ) : (
            <div className="space-y-4">
              {options.map((opt, idx) => {
                const key = `opt-${idx}`
                return (
                  <div key={key} className="rounded-xl border bg-white overflow-hidden">
                    <div className="px-3 py-2 border-b flex items-center justify-between">
                      <div className="text-sm font-semibold">{opt.title}</div>
                      <button
                        type="button"
                        onClick={() => copyText(opt.full, key)}
                        className="rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 px-3 py-1.5 text-xs font-medium"
                        title="Copy"
                      >
                        {copiedKey === key ? 'Copied' : 'Copy'}
                      </button>
                    </div>

                    <div className="px-3 py-3 text-sm whitespace-pre-wrap leading-relaxed">{opt.body}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

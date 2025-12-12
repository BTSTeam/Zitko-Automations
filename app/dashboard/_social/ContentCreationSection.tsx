'use client'

import React, { useEffect, useRef, useState } from 'react'

/* ========= helpers copied from SourceTab style ========= */

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
  label,
  options,
  values,
  setValues,
  placeholder = 'Select…',
}: {
  label: string
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
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <div ref={ref} className="relative rounded-xl border h-10 px-3">
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
            className={
              open
                ? 'rotate-180 transition-transform'
                : 'transition-transform'
            }
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
    </div>
  )
}

/* ========= option sets ========= */

const REGIONS = ['UK', 'Ireland', 'USA', 'APAC']

const CONTENT_THEMES = [
  'Own experience / story',
  'Industry tips & how-tos',
  'Job market update',
  'Holiday / seasonal',
  'Polls & questions',
  'Viral trend commentary',
]

const TONES = ['Professional', 'Conversational', 'Playful', 'Bold', 'Storytelling']

const AUDIENCES = ['Candidates', 'Clients', 'Both']

const FORMATS = [
  'Single post',
  'Carousel / multi-image',
  'Short series (3 posts)',
  'Full week plan (Mon–Sun)',
]

const HOOK_PREFS = ['Add a strong hook', 'Only write hooks', 'No hook']

const PLATFORMS = ['LinkedIn', 'Facebook', 'TikTok', 'Instagram']

/* ========= main component ========= */

export default function ContentCreationSection() {
  // chips from dropdowns
  const [regions, setRegions] = useState<string[]>([])
  const [themes, setThemes] = useState<string[]>([])
  const [tones, setTones] = useState<string[]>([])
  const [audiences, setAudiences] = useState<string[]>([])
  const [formats, setFormats] = useState<string[]>([])
  const [hookPrefs, setHookPrefs] = useState<string[]>([])
  const [platforms, setPlatforms] = useState<string[]>([])

  // free text context
  const [customTopic, setCustomTopic] = useState('')
  const [recentWins, setRecentWins] = useState('')

  // generation state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    setResult('')

    const hasShortFormVisual = platforms.some(
      (p) => p === 'TikTok' || p === 'Instagram',
    )

    try {
      const payload = {
        regions,
        themes,
        tones,
        audiences,
        formats,
        hookPrefs,
        platforms,
        customTopic,
        recentWins,
        // hint for your API: if true, return image/video *ideas* only
        preferVisualIdeasOnly: hasShortFormVisual,
      }

      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Request failed (${res.status})`)
      }

      const json = await res.json().catch(() => ({}))
      const text =
        typeof json?.content === 'string'
          ? json.content
          : typeof json?.result === 'string'
          ? json.result
          : ''

      setResult(text || 'No content returned.')
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
      // tiny visual hint – optional, could be a toast in future
      alert('Copied to clipboard')
    } catch {
      alert('Unable to copy – please select and copy manually.')
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
          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MultiSelect
                label="Region"
                options={REGIONS}
                values={regions}
                setValues={setRegions}
                placeholder="Choose one or more regions"
              />

              <MultiSelect
                label="Social platforms"
                options={PLATFORMS}
                values={platforms}
                setValues={setPlatforms}
                placeholder="LinkedIn, TikTok, Instagram…"
              />
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MultiSelect
                label="Content themes"
                options={CONTENT_THEMES}
                values={themes}
                setValues={setThemes}
                placeholder="Own experience, holiday, polls…"
              />

              <MultiSelect
                label="Tone of voice"
                options={TONES}
                values={tones}
                setValues={setTones}
                placeholder="Professional, playful…"
              />
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MultiSelect
                label="Audience"
                options={AUDIENCES}
                values={audiences}
                setValues={setAudiences}
                placeholder="Candidates, clients or both"
              />

              <MultiSelect
                label="Post format"
                options={FORMATS}
                values={formats}
                setValues={setFormats}
                placeholder="Single post, weekly plan…"
              />
            </div>

            {/* Row 4 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MultiSelect
                label="Hook preference"
                options={HOOK_PREFS}
                values={hookPrefs}
                setValues={setHookPrefs}
                placeholder="Add a strong hook, hook-only…"
              />

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Recent wins / ideas to reference (optional)
                </label>
                <textarea
                  className="w-full rounded-xl border px-3 py-2 text-sm min-h-[72px] outline-none focus:ring-1 focus:ring-[#F7941D]"
                  placeholder="e.g. big placement, promotion, new office, event, funny story…"
                  value={recentWins}
                  onChange={(e) => setRecentWins(e.target.value)}
                />
              </div>
            </div>

            {/* Row 5 – custom topic across full width */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Custom topic / context (optional)
              </label>
              <textarea
                className="w-full rounded-xl border px-3 py-2 text-sm min-h-[80px] outline-none focus:ring-1 focus:ring-[#F7941D]"
                placeholder="Add any extra detail you want included, or paste a JD / post you liked as inspiration."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end">
              <button
                type="submit"
                className="rounded-full bg-orange-500 text-white px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Panel 2 – output */}
      <div className="rounded-2xl border bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-semibold">Generated ideas</h3>
          <div className="flex items-center gap-2">
            {loading && (
              <span className="text-xs text-gray-500">Thinking…</span>
            )}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!result}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                result
                  ? 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
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
              Choose your options above and click <strong>Generate</strong> to
              create social content. Results will appear here ready to copy.
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

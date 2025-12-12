'use client'

import React, { useState } from 'react'

type Option = { value: string; label: string }

const BRAND_ORANGE = '#F7941D'

// ---- option lists ----
const SOCIAL_OPTIONS: Option[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
]

const REGION_OPTIONS: Option[] = [
  { value: 'uk', label: 'UK' },
  { value: 'ireland', label: 'Ireland' },
  { value: 'us', label: 'US' },
  { value: 'apac', label: 'APAC' },
]

const AUDIENCE_OPTIONS: Option[] = [
  { value: 'all', label: 'All' },
  { value: 'candidates', label: 'Candidates' },
  { value: 'clients', label: 'Clients' },
]

const TOPIC_OPTIONS: Option[] = [
  { value: 'hiring-advice', label: 'Hiring advice' },
  { value: 'candidate-tips', label: 'Candidate tips' },
  { value: 'market-insight', label: 'Market insight' },
  { value: 'skills-shortage', label: 'Skills shortage' },
  { value: 'career-progression', label: 'Career progression' },
  { value: 'ai-technology', label: 'AI & technology' },
  { value: 'seasonal-holiday', label: 'Seasonal / holiday' },
  { value: 'custom', label: 'My own topic' },
]

const TONE_OPTIONS: Option[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'insight-led', label: 'Insight-led' },
  { value: 'funny', label: 'Funny' },
]

const POST_TYPE_OPTIONS: Option[] = [
  { value: 'statement', label: 'Statement' },
  { value: 'question', label: 'Question' },
  { value: 'poll', label: 'Poll' },
]

const EXTRA_OPTIONS: Option[] = [
  { value: 'opening-hook', label: 'Add an opening hook' },
  { value: 'ending-hook', label: 'Add an ending hook' },
  { value: 'short', label: 'Keep it short' },
  { value: 'five-days', label: '5 days of content' },
]

// Re-use pill styles from rest of app
const pillBase =
  'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#F7941D]'

const pillPrimary =
  pillBase +
  ' bg-[#F7941D] text-white hover:bg-[#e98310] disabled:opacity-60 disabled:cursor-not-allowed'

const pillSecondary =
  pillBase +
  ' bg-[#3B3E44] text-white hover:bg-[#2c2f33] disabled:opacity-60 disabled:cursor-not-allowed'

// ---------- small helpers ----------

function classNames(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type MultiChipSelectProps = {
  label: string
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  single?: boolean // if true, behaves like single select but still shows a chip
}

function MultiChipSelect({
  label,
  options,
  selected,
  onChange,
  single = false,
}: MultiChipSelectProps) {
  const [open, setOpen] = useState(false)

  const selectedOptions = options.filter((o) => selected.includes(o.value))

  function toggleValue(value: string) {
    if (single) {
      const next = selected[0] === value ? [] : [value]
      onChange(next)
      setOpen(false)
      return
    }

    const exists = selected.includes(value)
    const next = exists
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    onChange(next)
  }

  const buttonLabel =
    selectedOptions.length === 0
      ? 'Select…'
      : selectedOptions.map((o) => o.label).join(', ')

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {label}
        </span>
      </div>

      {/* dropdown trigger (no shadow) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={classNames(
          'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm bg-white hover:bg-gray-50',
        )}
      >
        <span className={selectedOptions.length ? 'text-gray-900' : 'text-gray-400'}>
          {buttonLabel}
        </span>
        <span className="ml-2 text-gray-500 text-xs">▾</span>
      </button>

      {/* chips */}
      {selectedOptions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded-full bg-[#3B3E44] text-white text-xs px-2 py-0.5"
            >
              {opt.label}
              <button
                type="button"
                className="text-[10px] leading-none"
                onClick={() => toggleValue(opt.value)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* menu (styled similarly to other dropdowns, but no field shadows) */}
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-xl border bg-white max-h-56 overflow-auto text-sm">
          {options.map((opt) => {
            const active = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleValue(opt.value)}
                className={classNames(
                  'w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between',
                  active && 'bg-gray-100',
                )}
              >
                <span>{opt.label}</span>
                {active && <span className="text-[10px] text-emerald-600">●</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- main section ----------

export default function ContentCreationSection() {
  // selections (stored as arrays so everything can render as chips)
  const [social, setSocial] = useState<string[]>(['linkedin'])
  const [regions, setRegions] = useState<string[]>(['uk'])
  const [audience, setAudience] = useState<string[]>(['all'])
  const [topics, setTopics] = useState<string[]>([])
  const [customTopic, setCustomTopic] = useState('')
  const [tones, setTones] = useState<string[]>(['professional'])
  const [postTypes, setPostTypes] = useState<string[]>(['statement'])
  const [extras, setExtras] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState('')

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setOutput('')

    const primaryPlatform = social[0] ?? 'linkedin'
    const primaryRegion = regions[0] ?? ''
    const primaryAudience = audience[0] ?? ''
    const primaryTopic = topics[0] ?? ''
    const primaryTone = tones[0] ?? ''
    const primaryPostType = postTypes[0] ?? ''

    try {
      const res = await fetch('/api/social/content-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          socialPlatform: primaryPlatform,
          region: primaryRegion,
          audience: primaryAudience,
          topic: primaryTopic,
          customTopic,
          tone: primaryTone,
          postType: primaryPostType,
          options: extras,
        }),
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || `Request failed with status ${res.status}`)
      }

      const data = await res.json()
      setOutput(data.content ?? '')
    } catch (err: any) {
      console.error(err)
      setError('Something went wrong generating content.')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!output) return
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(output).catch(() => {})
    }
  }

  const platformIsVisual =
    (social[0] ?? '') === 'tiktok' || (social[0] ?? '') === 'instagram'

  return (
    <div className="flex flex-col gap-4">
      {/* PANEL 1: all field selections */}
      <section className="border rounded-2xl bg-white p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: '#3B3E44' }}>
              Content Creation
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Choose your settings and we’ll build a prompt to generate ready-to-use content.
            </p>
            {platformIsVisual && (
              <p className="text-[11px] text-amber-600 mt-1">
                TikTok / Instagram selected – output will focus on{' '}
                <span className="font-semibold">image / video ideas</span> that are viral or
                likely to go viral, not just plain text posts.
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className={pillSecondary}
              onClick={() => {
                setSocial(['linkedin'])
                setRegions(['uk'])
                setAudience(['all'])
                setTopics([])
                setCustomTopic('')
                setTones(['professional'])
                setPostTypes(['statement'])
                setExtras([])
                setOutput('')
                setError(null)
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className={pillPrimary}
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <MultiChipSelect
            label="Social platform"
            options={SOCIAL_OPTIONS}
            selected={social}
            onChange={setSocial}
            single
          />

          <MultiChipSelect
            label="Region"
            options={REGION_OPTIONS}
            selected={regions}
            onChange={setRegions}
          />

          <MultiChipSelect
            label="Audience"
            options={AUDIENCE_OPTIONS}
            selected={audience}
            onChange={setAudience}
          />

          <MultiChipSelect
            label="Topic"
            options={TOPIC_OPTIONS}
            selected={topics}
            onChange={setTopics}
          />

          <MultiChipSelect
            label="Tone"
            options={TONE_OPTIONS}
            selected={tones}
            onChange={setTones}
            single
          />

          <MultiChipSelect
            label="Post type"
            options={POST_TYPE_OPTIONS}
            selected={postTypes}
            onChange={setPostTypes}
            single
          />

          <div className="md:col-span-2 xl:col-span-3">
            <MultiChipSelect
              label="Options"
              options={EXTRA_OPTIONS}
              selected={extras}
              onChange={setExtras}
            />
          </div>
        </div>

        {/* custom topic textarea */}
        {topics.includes('custom') && (
          <div className="mt-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              My own topic
            </label>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm min-h-[72px] bg-white"
              placeholder="Describe the specific topic, story, or angle you want the content to focus on…"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
            />
          </div>
        )}
      </section>

      {/* PANEL 2: generated response only */}
      <section className="border rounded-2xl bg-white p-4 min-h-[260px] flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: '#3B3E44' }}>
              Generated content
            </h3>
            <p className="text-xs text-gray-500">
              Copy straight into your chosen social channel.
            </p>
          </div>
          <button
            type="button"
            className={pillSecondary + (output ? '' : ' opacity-50 cursor-not-allowed')}
            onClick={handleCopy}
            disabled={!output}
          >
            Copy
          </button>
        </div>

        {error && (
          <p className="mb-2 text-xs text-red-600">
            {error}
          </p>
        )}

        <textarea
          readOnly
          className="flex-1 w-full rounded-xl border px-3 py-2 text-sm bg-gray-50 resize-none min-h-[200px]"
          placeholder={
            loading
              ? 'Generating content…'
              : 'Your generated content will appear here.'
          }
          value={output}
        />
      </section>
    </div>
  )
}

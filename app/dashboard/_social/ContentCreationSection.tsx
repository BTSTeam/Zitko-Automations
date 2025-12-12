// app/dashboard/_social/ContentCreationSection.tsx
'use client'

import React, { useState } from 'react'

const REGIONS = ['UK', 'Ireland', 'US', 'APAC'] as const
const AUDIENCES = ['All', 'Candidates', 'Clients'] as const
const TOPICS = [
  'Hiring advice',
  'Candidate tips',
  'Market insight',
  'Skills shortage',
  'Career progression',
  'AI & technology',
  'Seasonal / holiday',
  'My own topic',
] as const
const TONES = ['Professional', 'Conversational', 'Insight-led', 'Funny'] as const
const POST_TYPES = ['Statement', 'Question', 'Poll'] as const

type Topic = (typeof TOPICS)[number]

type ContentResponse = {
  content: string
}

function OptionCard(props: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  const { label, selected, onClick } = props
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'card w-full px-3 py-2 text-sm md:text-base text-left transition',
        'border-2',
        selected
          ? 'border-brand-orange bg-orange-50'
          : 'border-transparent hover:border-gray-300',
      ].join(' ')}
    >
      <span className="font-medium">{label}</span>
    </button>
  )
}

export default function ContentCreationSection() {
  const [region, setRegion] = useState<string | null>(null)
  const [audience, setAudience] = useState<string | null>('All')
  const [topics, setTopics] = useState<Topic[]>([])
  const [customTopic, setCustomTopic] = useState('')
  const [tone, setTone] = useState<string | null>('Professional')
  const [postType, setPostType] = useState<string | null>('Statement')

  const [addOpeningHook, setAddOpeningHook] = useState(false)
  const [addEndingHook, setAddEndingHook] = useState(false)
  const [keepShort, setKeepShort] = useState(false)
  const [fiveDays, setFiveDays] = useState(false)

  const [generated, setGenerated] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleTopicClick = (topic: Topic) => {
    if (topic === 'My own topic') {
      if (topics.includes(topic)) {
        setTopics(prev => prev.filter(t => t !== topic))
      } else {
        setTopics(prev => [...prev, topic])
      }
      return
    }

    setTopics(prev =>
      prev.includes(topic)
        ? prev.filter(t => t !== topic)
        : [...prev, topic],
    )
  }

  const showCustomTopicInput = topics.includes('My own topic')

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setCopied(false)

    try {
      const body = {
        region,
        audience,
        topics: topics.filter(t => t !== 'My own topic'),
        customTopic: customTopic.trim(),
        tone,
        postType,
        addOpeningHook,
        addEndingHook,
        keepShort,
        fiveDays,
      }

      const res = await fetch('/api/social/content-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Failed to generate content')
      }

      const data = (await res.json()) as ContentResponse
      setGenerated(data.content || '')
    } catch (err: any) {
      setError(err?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!generated) return
    try {
      await navigator.clipboard.writeText(generated)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Top panel – options */}
      <div className="card p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Content Creation</h3>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="btn btn-brand flex items-center gap-2 disabled:opacity-60"
          >
            {loading ? 'Generating…' : 'Generate content'}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {/* Region */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Region
            </p>
            <div className="grid grid-cols-2 gap-2">
              {REGIONS.map(r => (
                <OptionCard
                  key={r}
                  label={r}
                  selected={region === r}
                  onClick={() => setRegion(prev => (prev === r ? null : r))}
                />
              ))}
            </div>
          </div>

          {/* Audience */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Audience
            </p>
            <div className="grid grid-cols-2 gap-2">
              {AUDIENCES.map(a => (
                <OptionCard
                  key={a}
                  label={a}
                  selected={audience === a}
                  onClick={() =>
                    setAudience(prev => (prev === a ? null : a))
                  }
                />
              ))}
            </div>
          </div>

          {/* Topic */}
          <div className="space-y-2 lg:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Topic
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TOPICS.map(t => (
                <OptionCard
                  key={t}
                  label={t}
                  selected={topics.includes(t)}
                  onClick={() => handleTopicClick(t)}
                />
              ))}
            </div>
            {showCustomTopicInput && (
              <div className="mt-2">
                <input
                  type="text"
                  value={customTopic}
                  onChange={e => setCustomTopic(e.target.value)}
                  placeholder="Describe your own topic…"
                  className="input text-sm"
                />
              </div>
            )}
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Tone
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map(t => (
                <OptionCard
                  key={t}
                  label={t}
                  selected={tone === t}
                  onClick={() => setTone(prev => (prev === t ? null : t))}
                />
              ))}
            </div>
          </div>

          {/* Post type */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Post type
            </p>
            <div className="grid grid-cols-2 gap-2">
              {POST_TYPES.map(p => (
                <OptionCard
                  key={p}
                  label={p}
                  selected={postType === p}
                  onClick={() =>
                    setPostType(prev => (prev === p ? null : p))
                  }
                />
              ))}
            </div>
          </div>

          {/* Extra options */}
          <div className="space-y-2 lg:col-span-2 xl:col-span-1">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Options
            </p>
            <div className="grid grid-cols-2 gap-2">
              <OptionCard
                label="Add an opening hook"
                selected={addOpeningHook}
                onClick={() => setAddOpeningHook(v => !v)}
              />
              <OptionCard
                label="Add an ending hook"
                selected={addEndingHook}
                onClick={() => setAddEndingHook(v => !v)}
              />
              <OptionCard
                label="Keep it short"
                selected={keepShort}
                onClick={() => setKeepShort(v => !v)}
              />
              <OptionCard
                label="5 days of content"
                selected={fiveDays}
                onClick={() => setFiveDays(v => !v)}
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      {/* Bottom panel – generated content */}
      <div className="card p-4 md:p-6 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase text-gray-500">
            Generated content
          </p>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!generated}
            className="btn btn-grey text-xs md:text-sm disabled:opacity-60"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <textarea
          className="input min-h-[180px] md:min-h-[220px] resize-none bg-gray-50"
          readOnly
          value={generated}
          placeholder="Your AI-generated social media content will appear here."
        />
      </div>
    </div>
  )
}

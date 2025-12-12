'use client'

import React, { useState } from 'react'

type Region = 'UK' | 'Ireland' | 'US' | 'APAC'
type Audience = 'Candidates' | 'Clients'
type Tone =
  | 'Professional'
  | 'Friendly'
  | 'Fun'
  | 'Bold'
  | 'Inspirational'
type PostType = 'Single post' | 'Weekly plan'
type SocialPlatform = 'LinkedIn' | 'Facebook' | 'TikTok' | 'Instagram'

type ApiState = 'idle' | 'loading' | 'done' | 'error'

export default function ContentCreationSection() {
  // Multi-selects via dropdown + chips
  const [regions, setRegions] = useState<Region[]>([])
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [tones, setTones] = useState<Tone[]>([])
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([])
  const [topics, setTopics] = useState<string[]>([])

  const [topicInput, setTopicInput] = useState('')
  const [postType, setPostType] = useState<PostType>('Single post')
  const [includeHook, setIncludeHook] = useState(true)

  const [experienceNotes, setExperienceNotes] = useState('')
  const [goal, setGoal] = useState('')
  const [extraNotes, setExtraNotes] = useState('')

  const [previewPrompt, setPreviewPrompt] = useState('')
  const [result, setResult] = useState('')
  const [apiState, setApiState] = useState<ApiState>('idle')

  // ---------- helpers for dropdown -> chips ----------

  function addUnique<T>(arr: T[], value: T): T[] {
    if (!value) return arr
    if (arr.includes(value)) return arr
    return [...arr, value]
  }

  function handleAddRegion(value: string) {
    if (!value) return
    setRegions(prev => addUnique(prev, value as Region))
  }

  function handleAddAudience(value: string) {
    if (!value) return
    setAudiences(prev => addUnique(prev, value as Audience))
  }

  function handleAddTone(value: string) {
    if (!value) return
    setTones(prev => addUnique(prev, value as Tone))
  }

  function handleAddPlatform(value: string) {
    if (!value) return
    setPlatforms(prev => addUnique(prev, value as SocialPlatform))
  }

  function handleAddTopic() {
    const t = topicInput.trim()
    if (!t) return
    if (!topics.includes(t)) setTopics(prev => [...prev, t])
    setTopicInput('')
  }

  function removeRegion(r: Region) {
    setRegions(prev => prev.filter(x => x !== r))
  }
  function removeAudience(a: Audience) {
    setAudiences(prev => prev.filter(x => x !== a))
  }
  function removeTone(t: Tone) {
    setTones(prev => prev.filter(x => x !== t))
  }
  function removePlatform(p: SocialPlatform) {
    setPlatforms(prev => prev.filter(x => x !== p))
  }
  function removeTopic(t: string) {
    setTopics(prev => prev.filter(x => x !== t))
  }

  // ---------- prompt builder ----------

  function buildPrompt() {
    const regionPart =
      regions.length > 0
        ? `Region(s): ${regions.join(', ')}.\n`
        : 'Region: not specified (Fire & Security market).\n'

    const audiencePart =
      audiences.length > 0
        ? `Audience: ${audiences.join(' & ')}.\n`
        : 'Audience: mixed (candidates and clients).\n'

    const tonePart =
      tones.length > 0
        ? `Tone: ${tones.join(', ')}.\n`
        : 'Tone: professional but human.\n'

    const topicsPart =
      topics.length > 0
        ? `Core topic(s): ${topics.join('; ')}.\n`
        : 'Core topic: Fire & Security recruitment / careers.\n'

    const hookPart = includeHook
      ? 'Include a strong hook at the start that encourages comments or replies.\n'
      : 'No special hook required.\n'

    const goalPart = goal
      ? `Goal of the content: ${goal}.\n`
      : 'Goal: build personal brand and generate inbound interest.\n'

    const experiencePart = experienceNotes
      ? `Consultant experience / story to weave in: ${experienceNotes}.\n`
      : ''

    const extraPart = extraNotes
      ? `Extra notes: ${extraNotes}.\n`
      : ''

    const platformPart =
      platforms.length > 0
        ? `Target platform(s): ${platforms.join(', ')}.\n`
        : 'Target platform: LinkedIn.\n'

    const isTikTokOrInsta =
      platforms.includes('TikTok') || platforms.includes('Instagram')

    const baseInstruction =
      postType === 'Weekly plan'
        ? `Create a weekly plan with 5 short posts (one per weekday), each with a distinct angle on the topics above, reusable across the selected platforms.\n`
        : `Create a single high-impact post based on the details above.\n`

    const outputInstruction = isTikTokOrInsta
      ? `For TikTok/Instagram, do NOT write full text captions. Instead, generate concrete **visual content ideas** for short videos or image carousels that are currently viral or likely to become viral in the Fire & Security niche.\n` +
        `Describe each idea in 2–3 bullet points: the shot concept, on-screen text, and any notable trend or effect (e.g. trending audio, transition style).\n`
      : `Focus on high-performing social posts with a clear structure (hook, value, call to action).`

    const platformSpecificNote = isTikTokOrInsta
      ? '\nImportant: Avoid giving long written captions. Focus on concepts for images or videos that follow current or emerging TikTok/Instagram trends.'
      : ''

    const prompt =
      `You are creating social media content for a Fire & Security recruitment consultant.\n\n` +
      regionPart +
      audiencePart +
      platformPart +
      tonePart +
      topicsPart +
      goalPart +
      experiencePart +
      extraPart +
      '\n' +
      baseInstruction +
      hookPart +
      outputInstruction +
      platformSpecificNote

    return prompt
  }

  async function handleGenerate() {
    const prompt = buildPrompt()
    setPreviewPrompt(prompt)
    setApiState('loading')
    setResult('')

    try {
      const res = await fetch('/api/social/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })

      if (!res.ok) throw new Error('Request failed')

      const data = await res.json()
      setResult(data?.content ?? 'No response text returned.')
      setApiState('done')
    } catch (e) {
      console.error(e)
      setResult('There was an error generating content.')
      setApiState('error')
    }
  }

  const pillChip =
    'inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 border border-gray-200'

  const pillRemove =
    'ml-1 text-[10px] cursor-pointer hover:text-red-500'

  const selectBase =
    'border rounded-lg px-2 py-1 text-xs bg-white'

  const sectionCard =
  'border rounded-2xl bg-white p-4 flex flex-col gap-3'

  const primaryBtn =
    'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium bg-[#F7941D] text-white hover:bg-[#e98310] disabled:opacity-60 disabled:cursor-not-allowed'

  return (
    <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT PANEL – Selections */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Content Creation</h2>

        {/* Region */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Region</span>
            <select
              className={selectBase}
              defaultValue=""
              onChange={(e) => {
                handleAddRegion(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Select region…</option>
              <option value="UK">UK</option>
              <option value="Ireland">Ireland</option>
              <option value="US">US</option>
              <option value="APAC">APAC</option>
            </select>
          </div>
          {regions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {regions.map(r => (
                <span key={r} className={pillChip}>
                  {r}
                  <button
                    type="button"
                    className={pillRemove}
                    onClick={() => removeRegion(r)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Audience */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Audience</span>
            <select
              className={selectBase}
              defaultValue=""
              onChange={(e) => {
                handleAddAudience(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Select audience…</option>
              <option value="Candidates">Candidates</option>
              <option value="Clients">Clients</option>
            </select>
          </div>
          {audiences.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {audiences.map(a => (
                <span key={a} className={pillChip}>
                  {a}
                  <button
                    type="button"
                    className={pillRemove}
                    onClick={() => removeAudience(a)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tone */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Tone</span>
            <select
              className={selectBase}
              defaultValue=""
              onChange={(e) => {
                handleAddTone(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Select tone…</option>
              <option value="Professional">Professional</option>
              <option value="Friendly">Friendly</option>
              <option value="Fun">Fun</option>
              <option value="Bold">Bold</option>
              <option value="Inspirational">Inspirational</option>
            </select>
          </div>
          {tones.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {tones.map(t => (
                <span key={t} className={pillChip}>
                  {t}
                  <button
                    type="button"
                    className={pillRemove}
                    onClick={() => removeTone(t)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Social Media Platform */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Social media</span>
            <select
              className={selectBase}
              defaultValue=""
              onChange={(e) => {
                handleAddPlatform(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Select platform…</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Facebook">Facebook</option>
              <option value="TikTok">TikTok</option>
              <option value="Instagram">Instagram</option>
            </select>
          </div>
          {platforms.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {platforms.map(p => (
                <span key={p} className={pillChip}>
                  {p}
                  <button
                    type="button"
                    className={pillRemove}
                    onClick={() => removePlatform(p)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          {(platforms.includes('TikTok') || platforms.includes('Instagram')) && (
            <p className="mt-2 text-[11px] text-amber-600">
              For TikTok / Instagram, the AI will generate **visual image/video ideas** based on viral trends, not long text posts.
            </p>
          )}
        </div>

        {/* Topics */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Topics</span>
            <div className="flex gap-2 flex-1">
              <input
                className="border rounded-lg px-2 py-1 text-xs flex-1"
                placeholder="Add a topic (e.g. salary trends, interview tips, fire systems)…"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTopic()
                  }
                }}
              />
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50"
                onClick={handleAddTopic}
              >
                Add
              </button>
            </div>
          </div>
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {topics.map(t => (
                <span key={t} className={pillChip}>
                  {t}
                  <button
                    type="button"
                    className={pillRemove}
                    onClick={() => removeTopic(t)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Post type + hook */}
        <div className={sectionCard}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Post type</span>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPostType('Single post')}
                  className={`px-3 py-1 rounded-full border ${
                    postType === 'Single post'
                      ? 'bg-[#F7941D] text-white border-[#F7941D]'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => setPostType('Weekly plan')}
                  className={`px-3 py-1 rounded-full border ${
                    postType === 'Weekly plan'
                      ? 'bg-[#F7941D] text-white border-[#F7941D]'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  Weekly plan
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={includeHook}
                onChange={(e) => setIncludeHook(e.target.checked)}
              />
              <span>Add a strong hook</span>
            </label>
          </div>
        </div>

        {/* Experience / goals */}
        <div className={sectionCard}>
          <span className="text-sm font-semibold mb-1">Your experience / goal</span>
          <textarea
            className="border rounded-lg w-full px-3 py-2 text-xs min-h-[60px] mb-2"
            placeholder="Short notes about your experience, niche, typical roles, or a story you'd like to use…"
            value={experienceNotes}
            onChange={(e) => setExperienceNotes(e.target.value)}
          />
          <textarea
            className="border rounded-lg w-full px-3 py-2 text-xs min-h-[40px] mb-2"
            placeholder="What are you trying to achieve? (e.g. more inbound CVs, client meetings, brand awareness)…"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <textarea
            className="border rounded-lg w-full px-3 py-2 text-xs min-h-[40px]"
            placeholder="Any extra notes for the AI (e.g. avoid certain topics, mention a specific location, etc.)…"
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleGenerate}
            className={primaryBtn}
            disabled={apiState === 'loading'}
          >
            {apiState === 'loading' ? 'Generating…' : 'Generate with AI'}
          </button>
        </div>
      </div>

      {/* RIGHT PANEL – Preview + Output (taller) */}
      <div className="flex flex-col gap-4">
        <div className="border rounded-2xl bg-white p-4 flex flex-col gap-3 min-h-[260px]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Prompt preview</h3>
            <span className="text-[10px] text-gray-400">
              (sent to ChatGPT)
            </span>
          </div>
          <div className="flex-1 rounded-lg bg-gray-50 border border-dashed border-gray-200 p-3 text-[11px] whitespace-pre-wrap overflow-auto">
            {previewPrompt || 'Your selections will build the prompt here once you click "Generate with AI".'}
          </div>
        </div>

        <div className="border rounded-2xl bg-white p-4 flex flex-col gap-3 min-h-[260px]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">AI output</h3>
            {apiState === 'done' && (
              <span className="text-[10px] text-emerald-600">Ready to copy</span>
            )}
            {apiState === 'loading' && (
              <span className="text-[10px] text-amber-500">Generating…</span>
            )}
          </div>
          <div className="flex-1 rounded-lg bg-gray-50 border border-dashed border-gray-200 p-3 text-[11px] whitespace-pre-wrap overflow-auto">
            {result || 'Once generated, your content or idea list will appear here for copy & paste.'}
          </div>
        </div>
      </div>
    </section>
  )
}

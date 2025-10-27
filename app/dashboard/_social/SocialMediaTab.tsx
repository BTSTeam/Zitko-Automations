'use client'
import React, { useMemo, useRef, useState } from 'react'
import Recorder from '../../_components/recorder'
import html2canvas from 'html2canvas'

type SocialMode = 'jobPosts' | 'generalPosts'

// ---- Template model ---------------------------------------------------------
type PlaceholderKey =
  | 'title'
  | 'location'
  | 'salary'
  | 'description'
  | 'benefits'
  | 'email'
  | 'phone'
  | 'video' // a rectangular slot we can mask

type TemplateDef = {
  id: string
  name: string
  // background image; put your PNGs in /public/templates/
  imageUrl: string
  // intrinsic pixel size of the design (we’ll scale to fit preview)
  width: number
  height: number
  // absolute positions relative to intrinsic size
  // x,y are top-left; w,h for blocks; font info kept simple
  layout: Record<
    Exclude<PlaceholderKey, 'video'>,
    { x: number; y: number; w?: number; h?: number; fontSize?: number; align?: 'left'|'right'|'center' }
  > & {
    video?: { x: number; y: number; w: number; h: number }
  }
}

const TEMPLATES: TemplateDef[] = [
  {
    id: 'zitko-1',
    name: 'Zitko – Dark Arcs',
    imageUrl: '/templates/zitko-dark-arcs.png',
    width: 1080,
    height: 1080,
    layout: {
      title:      { x: 420, y: 420, w: 540, fontSize: 36 },
      location:   { x: 450, y: 500, w: 500, fontSize: 22 },
      salary:     { x: 420, y: 540, w: 540, fontSize: 22 },
      description:{ x: 420, y: 580, w: 540, h: 120, fontSize: 18 },
      benefits:   { x: 420, y: 710, w: 540, h: 160, fontSize: 18 },
      email:      { x: 780, y: 980, w: 260, fontSize: 16, align:'right' },
      phone:      { x: 780, y: 1010, w: 260, fontSize: 16, align:'right' },
      video:      { x: 80, y: 80, w: 280, h: 280 },
    },
  },
  {
    id: 'zitko-2',
    name: 'Zitko – We’re Looking',
    imageUrl: '/templates/zitko-looking.png',
    width: 1080,
    height: 1080,
    layout: {
      title:      { x: 80,  y: 320, w: 520, fontSize: 34 },
      salary:     { x: 80,  y: 370, w: 520, fontSize: 22 },
      location:   { x: 80,  y: 410, w: 520, fontSize: 20 },
      description:{ x: 80,  y: 460, w: 520, h: 120, fontSize: 18 },
      benefits:   { x: 80,  y: 600, w: 520, h: 140, fontSize: 18 },
      email:      { x: 760, y: 940, w: 240, fontSize: 16, align:'right' },
      phone:      { x: 760, y: 980, w: 240, fontSize: 16, align:'right' },
      video:      { x: 720, y: 360, w: 280, h: 360 },
    },
  },
]

// ---- Helpers ----------------------------------------------------------------
function wrapText(text: string, maxCharsPerLine = 34) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const tryLine = current ? current + ' ' + w : w
    if (tryLine.length > maxCharsPerLine) {
      if (current) lines.push(current)
      current = w
    } else {
      current = tryLine
    }
  }
  if (current) lines.push(current)
  return lines.join('\n')
}

type VideoMask = 'none' | 'circle' | 'rounded' | 'hex'
function clipPath(mask: VideoMask, r: number) {
  switch (mask) {
    case 'circle': return 'circle(50% at 50% 50%)'
    case 'rounded': return `inset(0 round ${r}px)`
    case 'hex': return 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'
    default: return 'none'
  }
}

// ---- Main -------------------------------------------------------------------
export default function SocialMediaTab({ mode }: { mode: SocialMode }) {
  const [selectedTpl, setSelectedTpl] = useState<TemplateDef>(TEMPLATES[0])

  // Job data state (editable)
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState({
    title: '',
    location: '',
    salary: '',
    description: '',
    benefits: '' as string | string[], // accept bullets or raw string
    email: '',
    phone: '',
  })

  // Video state
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoMeta, setVideoMeta] = useState<{ mime: string; width: number; height: number } | null>(null)
  const [mask, setMask] = useState<VideoMask>('circle')
  const [roundedR, setRoundedR] = useState(32)

  // Preview logic
  const PREVIEW_MAX = 680 // px width of the right panel preview
  const scale = useMemo(() => Math.min(1, PREVIEW_MAX / selectedTpl.width), [PREVIEW_MAX, selectedTpl])

  const previewRef = useRef<HTMLDivElement | null>(null)

  // ---- Actions --------------------------------------------------------------
  async function fetchJob() {
    if (!jobId.trim()) return
    try {
      // You: implement this API to return { title, location, salary, description, benefits[], email, phone }
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      setJob({
        title: data.title ?? '',
        location: data.location ?? '',
        salary: data.salary ?? '',
        description: data.shortDescription ?? '',
        benefits: Array.isArray(data.benefits) ? data.benefits.join('\n') : (data.benefits ?? ''),
        email: data.email ?? '',
        phone: data.phone ?? '',
      })
    } catch (e) {
      console.error(e)
      alert('Could not retrieve job data')
    }
  }

  async function downloadPng() {
    if (!previewRef.current) return
    const canvas = await html2canvas(previewRef.current, { scale: 2 })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${selectedTpl.id}.png`
    a.click()
  }

  async function downloadMp4() {
    // Hand off to your server to compose MP4 (video + graphics) via Cloudinary/Mux.
    // Expect the server to return a downloadable URL.
    if (!videoUrl) {
      alert('Add a video first.')
      return
    }
    try {
      const res = await fetch('/api/export-mp4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTpl.id,
          job,
          video: { url: videoUrl, mask, roundedR },
        }),
      })
      if (!res.ok) throw new Error('Export failed')
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (e) {
      console.error(e)
      alert('MP4 export not set up yet. See /api/export-mp4 TODO.')
    }
  }

  // Normalized display strings
  const benefitsText = useMemo(() => {
    if (Array.isArray(job.benefits)) return (job.benefits as string[]).join('\n')
    return String(job.benefits || '')
  }, [job.benefits])

  // ---- UI -------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{mode === 'jobPosts' ? 'Job Posts' : 'General Posts'}</h2>

      {/* Template scroller */}
      <div className="w-full overflow-x-auto border rounded-lg p-3 bg-white">
        <div className="flex gap-3 min-w-max">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTpl(t)}
              className={`relative rounded-lg overflow-hidden border ${selectedTpl.id === t.id ? 'ring-2 ring-amber-500' : 'border-gray-200'} hover:opacity-90`}
              title={t.name}
            >
              <img src={t.imageUrl} alt={t.name} className="h-28 w-28 object-cover" />
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-6">
          {/* A) Video Record */}
          <section className="border rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Video record</h3>
              <div className="flex items-center gap-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <span>Mask</span>
                  <select
                    className="border rounded px-2 py-1"
                    value={mask}
                    onChange={e => setMask(e.target.value as VideoMask)}
                  >
                    <option value="none">None</option>
                    <option value="circle">Circle</option>
                    <option value="rounded">Rounded</option>
                    <option value="hex">Hex</option>
                  </select>
                </label>
                {mask === 'rounded' && (
                  <label className="inline-flex items-center gap-2">
                    <span>Radius</span>
                    <input type="number" className="w-20 border rounded px-2 py-1" value={roundedR} onChange={e => setRoundedR(Number(e.target.value || 0))} />
                  </label>
                )}
              </div>
            </div>

            <div className="mt-3">
              <Recorder
                onUploaded={(url, meta) => {
                  setVideoUrl(url)
                  setVideoMeta(meta)
                }}
              />
              {videoUrl && (
                <p className="mt-2 text-sm text-emerald-700 break-all">
                  Video attached ✓ <br />
                  <span className="text-gray-500">({videoMeta?.mime})</span>
                </p>
              )}
            </div>
          </section>

          {/* B) Job ID + fields */}
          <section className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold text-lg">Job details</h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input className="border rounded px-3 py-2 sm:col-span-2" placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} />
              <button className="rounded bg-gray-900 text-white px-3 py-2" onClick={fetchJob}>Fetch</button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Job Title" value={job.title} onChange={e => setJob({ ...job, title: e.target.value })} />
              <input className="border rounded px-3 py-2" placeholder="Location" value={job.location} onChange={e => setJob({ ...job, location: e.target.value })} />
              <input className="border rounded px-3 py-2" placeholder="Salary" value={job.salary} onChange={e => setJob({ ...job, salary: e.target.value })} />
              <input className="border rounded px-3 py-2" placeholder="Email" value={job.email} onChange={e => setJob({ ...job, email: e.target.value })} />
              <input className="border rounded px-3 py-2" placeholder="Phone Number" value={job.phone} onChange={e => setJob({ ...job, phone: e.target.value })} />
              <textarea className="border rounded px-3 py-2 sm:col-span-2 min-h-[80px]" placeholder="Short Description" value={job.description} onChange={e => setJob({ ...job, description: e.target.value })} />
              <textarea className="border rounded px-3 py-2 sm:col-span-2 min-h-[80px]" placeholder="Benefits (one per line)" value={benefitsText} onChange={e => setJob({ ...job, benefits: e.target.value })} />
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN - PREVIEW + EXPORT */}
        <div className="border rounded-xl p-4 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Preview</h3>
            <div className="flex gap-2">
              <button className="rounded bg-gray-900 text-white px-3 py-2" onClick={downloadPng}>
                Download PNG
              </button>
              <button
                className={`rounded px-3 py-2 ${videoUrl ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-500'}`}
                onClick={downloadMp4}
                title={videoUrl ? 'Compose MP4 on server' : 'Add a video to enable'}
              >
                Download MP4
              </button>
            </div>
          </div>

          {/* Preview board (scaled) */}
          <div className="mt-3 flex justify-center">
            <div
              ref={previewRef}
              className="relative shadow-lg"
              style={{
                width: selectedTpl.width * scale,
                height: selectedTpl.height * scale,
                backgroundImage: `url(${selectedTpl.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Render all text boxes */}
              {(['title','location','salary','description','benefits','email','phone'] as const).map(key => {
                const spec = selectedTpl.layout[key]
                if (!spec) return null
                const value = (() => {
                  switch (key) {
                    case 'title': return job.title || '[JOB TITLE]'
                    case 'location': return job.location || '[LOCATION]'
                    case 'salary': return job.salary || '[SALARY]'
                    case 'description': return wrapText(job.description || '[SHORT DESCRIPTION]')
                    case 'benefits': {
                      const tx = benefitsText || '[BENEFIT 1]\n[BENEFIT 2]\n[BENEFIT 3]'
                      return tx.split('\n').map(l => `• ${l}`).join('\n')
                    }
                    case 'email': return job.email || '[EMAIL]'
                    case 'phone': return job.phone || '[PHONE NUMBER]'
                  }
                })()
                return (
                  <div
                    key={key}
                    style={{
                      position: 'absolute',
                      left: spec.x * scale,
                      top: spec.y * scale,
                      width: (spec.w ?? selectedTpl.width - spec.x - 40) * scale,
                      height: (spec.h ?? 'auto') as any,
                      fontSize: (spec.fontSize ?? 18) * scale,
                      lineHeight: 1.25,
                      whiteSpace: 'pre-wrap',
                      textAlign: spec.align ?? 'left',
                      color: 'white',
                      fontWeight: key === 'title' ? 700 : 500,
                    }}
                  >
                    {value}
                  </div>
                )
              })}

              {/* Video slot (masked) */}
              {selectedTpl.layout.video && videoUrl && (
                <div
                  style={{
                    position: 'absolute',
                    left: selectedTpl.layout.video.x * scale,
                    top: selectedTpl.layout.video.y * scale,
                    width: selectedTpl.layout.video.w * scale,
                    height: selectedTpl.layout.video.h * scale,
                    overflow: 'hidden',
                    clipPath: clipPath(mask, roundedR * scale),
                    background: '#111',
                  }}
                >
                  <video
                    src={videoUrl}
                    playsInline
                    controls
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            PNG export is rendered at the template’s intrinsic size (e.g., 1080×1080).  
            MP4 export is server-side (recommended: Cloudinary or Mux).
          </p>
        </div>
      </div>
    </div>
  )
}

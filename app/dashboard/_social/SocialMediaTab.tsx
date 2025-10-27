'use client'

import React, {
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from 'react'
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
  | 'video'

type TemplateDef = {
  id: string
  name: string
  imageUrl: string
  width: number
  height: number
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
    imageUrl: '/templates/zitko-dark-arc.png',
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

  // Job data
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState({
    title: '',
    location: '',
    salary: '',
    description: '',
    benefits: '' as string | string[],
    email: '',
    phone: '',
  })

  // Video
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoMeta, setVideoMeta] = useState<{ mime: string; width: number; height: number } | null>(null)
  const [mask, setMask] = useState<VideoMask>('circle')
  const [roundedR, setRoundedR] = useState(32)
  const [videoOpen, setVideoOpen] = useState(true) // collapsible

  // Preview scaling — always show whole poster
  const previewBoxRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.4)

  useLayoutEffect(() => {
    if (!previewBoxRef.current) return
    const el = previewBoxRef.current
    const ro = new ResizeObserver(([entry]) => {
      const { width: cw, height: ch } = entry.contentRect
      // small padding so it never touches edges
      const PAD = 12
      const s = Math.min(
        (cw - PAD) / selectedTpl.width,
        (ch - PAD) / selectedTpl.height
      )
      setScale(Number.isFinite(s) ? Math.max(0.05, Math.min(1, s)) : 0.4)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [selectedTpl.width, selectedTpl.height])

  const previewRef = useRef<HTMLDivElement | null>(null)

  // ---- Actions --------------------------------------------------------------
  async function fetchJob() {
    if (!jobId.trim()) return
    try {
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

      {/* Equal columns again */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-6">
          {/* A) Video Record (collapsible) */}
          <section className="border rounded-xl bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-lg">Video record</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setVideoOpen(v => !v)}
                  className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
                  aria-expanded={videoOpen}
                  aria-controls="video-panel"
                  title={videoOpen ? 'Hide' : 'Show'}
                >
                  {videoOpen ? 'Hide ▲' : 'Show ▼'}
                </button>
              </div>
            </div>

            <div
              id="video-panel"
              className={`transition-[max-height] duration-300 ease-in-out ${videoOpen ? 'max-h-[1200px]' : 'max-h-0'}`}
            >
              <div className="p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="inline-flex items-center gap-2 text-sm">
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
                    <label className="inline-flex items-center gap-2 text-sm">
                      <span>Radius</span>
                      <input
                        type="number"
                        className="w-20 border rounded px-2 py-1"
                        value={roundedR}
                        onChange={e => setRoundedR(Number(e.target.value || 0))}
                      />
                    </label>
                  )}
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
              </div>
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

          {/* Fit area for preview — smaller so whole image is visible */}
          <div
            ref={previewBoxRef}
            className="mt-3 h-[64vh] min-h-[420px] w-full overflow-hidden flex items-center justify-center bg-muted/20 rounded-lg"
          >
            {/* poster at intrinsic pixel size, scaled to fit */}
            <div
              ref={previewRef}
              className="relative shadow-lg"
              style={{
                width: selectedTpl.width,
                height: selectedTpl.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
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
                      left: spec.x,
                      top: spec.y,
                      width: (spec.w ?? selectedTpl.width - spec.x - 40),
                      height: (spec.h ?? 'auto') as any,
                      fontSize: (spec.fontSize ?? 18),
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
                    left: selectedTpl.layout.video.x,
                    top: selectedTpl.layout.video.y,
                    width: selectedTpl.layout.video.w,
                    height: selectedTpl.layout.video.h,
                    overflow: 'hidden',
                    clipPath: clipPath(mask, roundedR),
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
            Preview is scaled to fit the area; PNG exports at the template’s intrinsic size (e.g., 1080×1080).
          </p>
        </div>
      </div>
    </div>
  )
}

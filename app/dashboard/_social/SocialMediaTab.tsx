'use client'

import React, { useMemo, useRef, useState, useLayoutEffect, useEffect } from 'react'
import Recorder from '../../_components/recorder'
import html2canvas from 'html2canvas'

type SocialMode = 'jobPosts' | 'generalPosts'

type PlaceholderKey =
  | 'title' | 'location' | 'salary' | 'description' | 'benefits' | 'email' | 'phone' | 'video'

type LayoutBox = {
  x: number
  y: number
  w?: number
  h?: number
  fontSize?: number
  align?: 'left' | 'right' | 'center'
}

type TemplateDef = {
  id: string
  name: string
  imageUrl: string
  width: number
  height: number
  layout: Record<Exclude<PlaceholderKey, 'video'>, LayoutBox> & {
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
      title:       { x: 520, y: 125, w: 560, fontSize: 60 },
      location:    { x: 520, y: 330, w: 520, fontSize: 30 },
      salary:      { x: 520, y: 400, w: 520, fontSize: 28 },
      description: { x: 520, y: 480, w: 520, h: 80, fontSize: 24 },
      benefits:    { x: 520, y: 680, w: 520, h: 260, fontSize: 24 },
      email:       { x: 800, y: 962, w: 180, fontSize: 20, align: 'left' },
      phone:       { x: 800, y: 1018, w: 180, fontSize: 20, align: 'left' },
      video:       { x: 80,  y: 400,  w: 300, h: 300 },
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
      email:      { x: 800, y: 975, w: 180, fontSize: 20, align: 'left' },
      phone:      { x: 800, y: 1030, w: 180, fontSize: 20, align: 'left' },
      video:      { x: 720, y: 360, w: 280, h: 360 },
    },
  },
]

const CLOUDINARY_TEMPLATES: Record<string, string> = {
  'zitko-1': 'job-posts/templates/zitko-1',
  'zitko-2': 'job-posts/templates/zitko-2',
}

// ---------- helpers ----------
function wrapText(text: string, maxCharsPerLine = 34) {
  const words = String(text ?? '').split(/\s+/)
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

function stripTags(html: string) {
  return String(html ?? '').replace(/<[^>]*>/g, ' ')
}
function extractEmailPhoneFallback(textOrHtml: string) {
  const text = stripTags(textOrHtml)
  const emailMatch = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)
  const phoneCandidates = (text.match(/(\+?\d[\d\s().-]{7,}\d)/g) || []).map(s => s.trim())
  const phoneBest = phoneCandidates.sort((a, b) => b.length - a.length)[0]
  return { email: emailMatch?.[0] ?? '', phone: phoneBest ?? '' }
}

// ---------- main ----------
export default function SocialMediaTab({ mode }: { mode: SocialMode }) {
  const [selectedTplId, setSelectedTplId] = useState(TEMPLATES[0].id)
  const selectedTpl = useMemo(() => TEMPLATES.find(t => t.id === selectedTplId)!, [selectedTplId])

  // job data
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState({
    title: '', location: '', salary: '', description: '', benefits: '' as string | string[], email: '', phone: '',
  })

  // video state
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoPublicId, setVideoPublicId] = useState<string | null>(null)
  const [videoMeta, setVideoMeta] = useState<{ mime: string; width: number; height: number } | null>(null)
  const [mask, setMask] = useState<VideoMask>('circle')
  const [roundedR, setRoundedR] = useState(32)
  const [videoOpen, setVideoOpen] = useState(false)

  // preview scaling
  const previewBoxRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.4)
  useLayoutEffect(() => {
    if (!previewBoxRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width: cw, height: ch } = entry.contentRect
      const PAD = 16
      const EPS = 0.003
      const s = Math.min((cw - PAD) / selectedTpl.width, (ch - PAD) / selectedTpl.height) - EPS
      setScale(Number.isFinite(s) ? Math.max(0.05, Math.min(1, s)) : 0.4)
    })
    ro.observe(previewBoxRef.current)
    return () => ro.disconnect()
  }, [selectedTpl.width, selectedTpl.height])

  const previewRef = useRef<HTMLDivElement | null>(null)
  const [fetchStatus, setFetchStatus] = useState<'idle'|'loading'|'done'|'error'>('idle')

  // === Recorder UI tweaks (purely cosmetic, doesn’t touch Recorder code) ===
  const recorderWrapRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = recorderWrapRef.current
    if (!root) return

    // Make “Record” / “Recording…” w/ red text.
    const mo = new MutationObserver(() => {
      const btn = root.querySelector<HTMLButtonElement>('button[data-recorder-start]')
      if (btn) {
        const isActive = btn.getAttribute('aria-pressed') === 'true' || btn.dataset.state === 'recording'
        btn.textContent = isActive ? 'Recording…' : 'Record'
        btn.classList.toggle('text-red-600', !!isActive)
      }
    })
    mo.observe(root, { subtree: true, attributes: true, childList: true })
    return () => mo.disconnect()
  }, [])

  // ------------ data fetch (unchanged except for brevity) ------------
  async function fetchJob() {
    const id = jobId.trim()
    if (!id) return
    setFetchStatus('loading')
    try {
      const r = await fetch(`/api/vincere/position/${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('Not found')
      const data = await r.json()
      const publicDesc: string = data?.public_description || data?.publicDescription || data?.description || ''

      let extracted: any = {}
      try {
        const ai = await fetch('/api/job/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: publicDesc }) })
        if (ai.ok) extracted = await ai.json()
      } catch {}

      let shortDesc = ''
      try {
        const teaser = await fetch('/api/job/short-description', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: publicDesc }) })
        if (teaser.ok) shortDesc = (await teaser.json()).description ?? ''
      } catch {}

      let contactEmail = String(extracted?.contactEmail ?? '').trim()
      let contactPhone = String(extracted?.contactPhone ?? '').trim()
      if (!contactEmail || !contactPhone) {
        const fb = extractEmailPhoneFallback(publicDesc)
        contactEmail = contactEmail || fb.email
        contactPhone = contactPhone || fb.phone
      }

      setJob({
        title: extracted?.title ?? data?.title ?? '',
        location: extracted?.location ?? data?.location ?? '',
        salary: extracted?.salary ?? data?.salary ?? '',
        description: shortDesc,
        benefits: Array.isArray(extracted?.benefits) ? extracted.benefits.join('\n') : String(data?.benefits ?? ''),
        email: contactEmail || data?.email || '',
        phone: contactPhone || data?.phone || '',
      })
      setFetchStatus('done')
      setTimeout(() => setFetchStatus('idle'), 2000)
    } catch (e) {
      console.error(e)
      setFetchStatus('error')
      alert('Could not retrieve job data')
      setTimeout(() => setFetchStatus('idle'), 1500)
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
    if (!videoPublicId) {
      alert('Add a video first.')
      return
    }
    const payload = {
      videoPublicId,
      title: job.title || 'Job Title',
      location: job.location || 'Location',
      salary: job.salary || 'Salary',
      description: wrapText(String(job.description || 'Short description')),
      benefits: benefitsText,
      email: job.email || '',
      phone: job.phone || '',
      templateId: selectedTplId,
    }
    const res = await fetch('/api/job/download-mp4', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const contentType = res.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')
    if (!res.ok) {
      const errPayload = isJson ? await res.json().catch(() => ({})) : {}
      alert(`Failed: ${errPayload.error || res.statusText}`)
      console.error('Download MP4 error payload:', errPayload)
      return
    }
    if (isJson) {
      const j = await res.json().catch(() => ({}))
      if (j.composedUrl) {
        console.log('DEBUG composedUrl:', j.composedUrl)
        alert('Debug: composedUrl logged to console.')
        return
      }
      alert('Unexpected JSON response from server.')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'job-post.mp4'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const benefitsText = useMemo(() => {
    if (Array.isArray(job.benefits)) return (job.benefits as string[]).join('\n')
    return String(job.benefits || '')
  }, [job.benefits])

  const clearVideo = () => {
    setVideoUrl(null)
    setVideoPublicId(null)
    setVideoMeta(null)
    setVideoOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{mode === 'jobPosts' ? 'Job Posts' : 'General Posts'}</h2>

      {/* template scroller */}
      <div className="w-full overflow-x-auto border rounded-lg p-3 bg-white">
        <div className="flex gap-3 min-w-max">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTplId(t.id)}
              className={`relative rounded-lg overflow-hidden border ${selectedTplId === t.id ? 'ring-2 ring-amber-500' : 'border-gray-200'} hover:opacity-90`}
              title={t.name}
            >
              <img src={t.imageUrl} alt={t.name} className="h-28 w-28 object-cover" />
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: recorder + form */}
        <div className="flex flex-col gap-6">
          {/* recorder (collapsible) */}
          <section className="border rounded-xl bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-lg">Video record</h3>
              <div className="flex items-center gap-3">
                {/* removed “Video attached ✓” message */}
                <button
                  type="button"
                  onClick={() => setVideoOpen(v => !v)}
                  className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
                  aria-expanded={videoOpen}
                  aria-controls="video-panel"
                  title={videoOpen ? 'Hide' : 'Show'}
                >
                  {videoOpen ? '▴' : '▾'}
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
                      className="border rounded px-2 py-1 h-8 text-sm"
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
                        className="w-20 border rounded px-2 py-1 h-8 text-sm"
                        value={roundedR}
                        onChange={e => setRoundedR(Number(e.target.value || 0))}
                      />
                    </label>
                  )}
                </div>

                {/* If a video has been captured/uploaded, show playback in place of the live feed */}
                <div className="mt-3">
                  {videoUrl ? (
                    <div className="space-y-3">
                      <div className="aspect-video bg-black rounded-lg overflow-hidden">
                        <video src={videoUrl} controls playsInline className="w-full h-full object-contain" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-900"
                          onClick={() => setVideoOpen(false)}
                          title="Hide panel"
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white"
                          onClick={clearVideo}
                          title="Remove this video so you can record/upload a new one"
                        >
                          Remove video
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div ref={recorderWrapRef} className="recorder-slim">
                      <Recorder
                        jobId={jobId || 'unassigned'}
                        onUploaded={(payload: any) => {
                          setVideoUrl(payload.playbackMp4)
                          setVideoPublicId(payload.publicId)
                          setVideoMeta({ mime: payload.mime, width: payload.width, height: payload.height })
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* job details */}
          <section className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold text-lg">Job details</h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input className="border rounded px-3 py-2 sm:col-span-2" placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} />
              <button
                className="rounded bg-gray-900 text-white px-3 py-2 disabled:opacity-60"
                onClick={fetchJob}
                disabled={fetchStatus === 'loading'}
              >
                {fetchStatus === 'loading' ? 'Fetching…' : fetchStatus === 'done' ? 'Fetched ✓' : 'Fetch'}
              </button>
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

        {/* RIGHT: preview + export */}
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

          <div
            ref={previewBoxRef}
            className="mt-3 h-[64vh] min-h-[420px] w-full overflow-hidden flex items-center justify-center bg-muted/20 rounded-lg"
          >
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
              {(['title','location','salary','description','benefits','email','phone'] as const).map(key => {
                const spec = selectedTpl.layout[key]
                if (!spec) return null
                const value = (() => {
                  switch (key) {
                    case 'title': return job.title || '[JOB TITLE]'
                    case 'location': return job.location || '[LOCATION]'
                    case 'salary': return job.salary || '[SALARY]'
                    case 'description': return job.description || '[SHORT DESCRIPTION]'
                    case 'benefits': {
                      const tx = (Array.isArray(job.benefits) ? job.benefits.join('\n') : job.benefits) || '[BENEFIT 1]\n[BENEFIT 2]\n[BENEFIT 3]'
                      return tx.split('\n').map(l => `• ${l}`).join('\n\n')
                    }
                    case 'email': return job.email || '[EMAIL]'
                    case 'phone': return job.phone || '[PHONE NUMBER]'
                  }
                })()

                if (key === 'benefits') {
                  const benefitsLines: string[] = Array.isArray(job.benefits)
                    ? (job.benefits as string[]).filter(Boolean)
                    : String(job.benefits || '').split('\n').map(s => s.trim()).filter(Boolean)

                  return (
                    <div
                      key={key}
                      style={{
                        position: 'absolute',
                        left: spec.x * scale,
                        top: spec.y * scale,
                        width: (spec.w ?? (selectedTpl.width - spec.x - 40)) * scale,
                        height: spec.h ? spec.h * scale : undefined,
                        fontSize: (spec.fontSize ?? 18) * scale,
                        lineHeight: 1.25,
                        textAlign: spec.align ?? 'left',
                        color: 'white',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {benefitsLines.map((line, i) => (
                        <div
                          key={i}
                          style={{
                            paddingLeft: `${16 * scale}px`,
                            textIndent: `-${8 * scale}px`,
                            whiteSpace: 'pre-wrap',
                            marginBottom: `${8 * scale}px`,
                          }}
                        >
                          {`• ${line}`}
                        </div>
                      ))}
                    </div>
                  )
                }

                return (
                  <div
                    key={key}
                    style={{
                      position: 'absolute',
                      left: spec.x * scale,
                      top: spec.y * scale,
                      width: (spec.w ?? (selectedTpl.width - spec.x - 40)) * scale,
                      height: spec.h ? spec.h * scale : undefined,
                      fontSize: (spec.fontSize ?? 18) * scale,
                      lineHeight: 1.25,
                      whiteSpace: 'pre-wrap',
                      textAlign: spec.align ?? 'left',
                      color: 'white',
                      fontWeight: key === 'title' ? 700 : 500,
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {value}
                  </div>
                )
              })}

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
                  <video src={videoUrl} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Preview scales the poster to fit; PNG exports at the template’s intrinsic size.
          </p>
        </div>
      </div>

      {/* Recorder-specific style tweaks */}
      <style jsx global>{`
        /* 4) Upload button orange + 7) shrink camera/mic selects inside the panel */
        .recorder-slim select { height: 2rem; font-size: 0.875rem; max-width: 280px; }
        .recorder-slim input[type="number"] { height: 2rem; font-size: 0.875rem; }
        /* Try to hit common “Upload” button(s) the Recorder renders */
        .recorder-slim button[data-upload],
        .recorder-slim button.upload,
        .recorder-slim button[aria-label="Upload"],
        .recorder-slim button:where(:not([disabled])):is(.upload-btn) {
          background: #f97316 !important; /* orange-500 */
          color: #fff !important;
        }
        /* 2) Start button text via data attribute (we also adjust it via MutationObserver) */
        .recorder-slim button[data-recorder-start].text-red-600 { color: #dc2626 !important; }
      `}</style>
    </div>
  )
}

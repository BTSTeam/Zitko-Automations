// app/dashboard/_social/JobZoneTab.tsx
'use client'

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import html2canvas from 'html2canvas'

type PlaceholderKey =
  | 'title'
  | 'location'
  | 'salary'
  | 'description'
  | 'benefits'
  | 'email'
  | 'phone'

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
  layout: Record<PlaceholderKey, LayoutBox>
}

type ZoneRegion = 'ire' | 'uk' | 'us'

type ZoneJob = {
  id: string
  title: string
  location: string
  salary: string
  description: string
  benefits: string
  email: string
  phone: string
}

type LayoutState = {
  positions: Partial<Record<PlaceholderKey, { x: number; y: number }>>
  fontSizes: Partial<Record<PlaceholderKey, number>>
}

// --- constants --------------------------------------------------------------

const PREVIEW_SCALE = 0.35

const DARK_ARCS_TEMPLATE: TemplateDef = {
  id: 'zitko-1',
  name: 'Zitko – Dark Arcs',
  imageUrl: '/templates/zitko-dark-arc.png',
  width: 1080,
  height: 1080,
  layout: {
    title:      { x: 470, y: 300, w: 560, fontSize: 60 },
    location:   { x: 520, y: 420, w: 520, fontSize: 30 },
    salary:     { x: 520, y: 500, w: 520, fontSize: 28 },
    description:{ x: 520, y: 570, w: 520, h: 80,  fontSize: 24 },
    benefits:   { x: 520, y: 760, w: 520, h: 260, fontSize: 24 },
    email:      { x: 800, y: 962, w: 180, fontSize: 20, align: 'left' },
    phone:      { x: 800, y: 1018, w: 180, fontSize: 20, align: 'left' },
  },
}

const US_JZ_TEMPLATE: TemplateDef = {
  id: 'us-jz',
  name: 'US – Job Zone',
  imageUrl: '/templates/US-JZ-Template.png',
  width: 1080,
  height: 1080,
  layout: {
    title:      { x: 470, y: 300, w: 560, fontSize: 60 },
    location:   { x: 520, y: 420, w: 520, fontSize: 30 },
    salary:     { x: 520, y: 500, w: 520, fontSize: 28 },
    description:{ x: 520, y: 570, w: 520, h: 80,  fontSize: 24 },
    benefits:   { x: 520, y: 760, w: 520, h: 260, fontSize: 24 },
    email:      { x: 800, y: 962, w: 180, fontSize: 20, align: 'left' },
    phone:      { x: 800, y: 1018, w: 180, fontSize: 20, align: 'left' },
  },
}

const COVER_BY_REGION: Record<ZoneRegion, string> = {
  ire: '/templates/IRE-Cover.png',
  uk:  '/templates/UK-Cover.png',
  us:  '/templates/US-Cover.png',
}

const LOCATION_ICON_SRC = '/templates/Location-Icon.png'

const pillBase =
  'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#F7941D]'
const pillPrimary =
  pillBase +
  ' bg-[#F7941D] text-white hover:bg-[#e98310] disabled:opacity-60 disabled:cursor-not-allowed'
const pillSecondary =
  pillBase +
  ' bg-[#3B3E44] text-white hover:bg-[#2c2f33] disabled:opacity-60 disabled:cursor-not-allowed'

// --- helpers ---------------------------------------------------------------

function templateForRegion(region: ZoneRegion): TemplateDef {
  return region === 'us' ? US_JZ_TEMPLATE : DARK_ARCS_TEMPLATE
}

function stripTags(html: string) {
  return String(html ?? '').replace(/<[^>]*>/g, ' ')
}

function extractEmailPhoneFallback(textOrHtml: string) {
  const text = stripTags(textOrHtml)
  const emailMatch = text.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  )
  const phoneCandidates =
    text.match(/(\+?\d[\d\s().-]{7,}\d)/g)?.map((s) => s.trim()) ?? []
  const phoneBest = phoneCandidates.sort(
    (a, b) => b.length - a.length,
  )[0]
  return {
    email: emailMatch?.[0] ?? '',
    phone: phoneBest ?? '',
  }
}

// --- component -------------------------------------------------------------

export default function JobZoneTab(): JSX.Element {
  const [region, setRegion] = useState<ZoneRegion>('ire')

  const [jobIds, setJobIds] = useState<string[]>([
    '', '', '', '', '', '', '', '',
  ])
  const [loadingJobs, setLoadingJobs] = useState(false)

  const [jobs, setJobs] = useState<ZoneJob[]>([])
  const [layouts, setLayouts] = useState<LayoutState[]>([])

  // left-hand editor job
  const [activeIndex, setActiveIndex] = useState(0)
  // preview slide (0 = cover, >=1 = job index + 1)
  const [previewIndex, setPreviewIndex] = useState(0)

  // export refs
  const coverRef = useRef<HTMLDivElement | null>(null)
  const jobExportRefs = useRef<(HTMLDivElement | null)[]>([])

  const tpl = useMemo(
    () => templateForRegion(region),
    [region],
  )

  useEffect(() => {
    setLayouts(
      jobs.map(() => ({
        positions: {},
        fontSizes: {},
      })),
    )
  }, [jobs.length])

  function updateJobId(index: number, value: string) {
    setJobIds((prev) => {
      const copy = [...prev]
      copy[index] = value
      return copy
    })
  }

  function updateJob(index: number, patch: Partial<ZoneJob>) {
    setJobs((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], ...patch }
      return copy
    })
  }

  function adjustFontSize(
    jobIndex: number,
    key: PlaceholderKey,
    delta: number,
  ) {
    setLayouts((prev) => {
      const copy = [...prev]
      const current = copy[jobIndex] ?? {
        positions: {},
        fontSizes: {},
      }
      const base =
        current.fontSizes[key] ??
        tpl.layout[key]?.fontSize ??
        18
      const next = Math.max(8, base + delta)
      copy[jobIndex] = {
        ...current,
        fontSizes: {
          ...current.fontSizes,
          [key]: next,
        },
      }
      return copy
    })
  }

  function makeDragHandlers(
    jobIndex: number,
    key: PlaceholderKey,
  ) {
    return {
      onMouseDown: (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const baseSpec = tpl.layout[key]
        if (!baseSpec) return
        const startY = e.clientY
        const current =
          layouts[jobIndex]?.positions[key] ?? {
            x: baseSpec.x,
            y: baseSpec.y,
          }

        const handleMove = (ev: MouseEvent) => {
          const dy = (ev.clientY - startY) / PREVIEW_SCALE
          setLayouts((prev) => {
            const copy = [...prev]
            const prevLayout = copy[jobIndex] ?? {
              positions: {},
              fontSizes: {},
            }
            copy[jobIndex] = {
              ...prevLayout,
              positions: {
                ...prevLayout.positions,
                [key]: {
                  x: current.x,
                  y: current.y + dy,
                },
              },
            }
            return copy
          })
        }

        const handleUp = () => {
          window.removeEventListener('mousemove', handleMove)
          window.removeEventListener('mouseup', handleUp)
        }

        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleUp)
      },
    }
  }

  async function retrieveJobs() {
    const ids = jobIds.map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) return
    setLoadingJobs(true)

    const results: ZoneJob[] = []

    for (const id of ids.slice(0, 8)) {
      try {
        const r = await fetch(
          `/api/vincere/position/${encodeURIComponent(id)}`,
          { cache: 'no-store' },
        )
        if (!r.ok) throw new Error('Not found')
        const data = await r.json()

        const publicDesc: string =
          data?.public_description ||
          data?.publicDescription ||
          data?.description ||
          ''

        let extracted: any = {}
        try {
          const ai = await fetch('/api/job/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: publicDesc,
              mode: 'default',
            }),
          })
          if (ai.ok) extracted = await ai.json()
        } catch {
          // ignore
        }

        let shortDesc = ''
        try {
          const teaser = await fetch('/api/job/short-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: publicDesc,
              mode: 'default',
            }),
          })
          if (teaser.ok) {
            const t = await teaser.json()
            shortDesc = t.description ?? ''
          }
        } catch {
          // ignore
        }

        let contactEmail = String(extracted?.contactEmail ?? '').trim()
        let contactPhone = String(extracted?.contactPhone ?? '').trim()

        if (!contactEmail || !contactPhone) {
          const fb = extractEmailPhoneFallback(publicDesc)
          contactEmail = contactEmail || fb.email
          contactPhone = contactPhone || fb.phone
        }

        results.push({
          id,
          title: extracted?.title ?? data?.title ?? '',
          location: extracted?.location ?? data?.location ?? '',
          salary: extracted?.salary ?? data?.salary ?? '',
          description: shortDesc,
          benefits: Array.isArray(extracted?.benefits)
            ? extracted.benefits.join('\n')
            : String(data?.benefits ?? ''),
          email: contactEmail || data?.email || '',
          phone: contactPhone || data?.phone || '',
        })
      } catch (err) {
        console.error(err)
        alert(`Could not retrieve job data for ID ${id}`)
      }
    }

    setJobs(results)
    setActiveIndex(0)
    setPreviewIndex(0) // start preview on cover
    setLoadingJobs(false)
  }

  // --- rendering helpers ---------------------------------------------------

  function renderJobPoster(
    jobIndex: number,
    scale: number,
    ref?: React.Ref<HTMLDivElement>,
  ) {
    const job = jobs[jobIndex]
    const layout = layouts[jobIndex] ?? {
      positions: {},
      fontSizes: {},
    }
  
    const { width, height, imageUrl, layout: base } = tpl
  
    return (
      <div
        ref={ref as any}
        data-jz-export-job={scale === 1 ? '1' : undefined}
        style={{
          position: 'relative',
          width: width * scale,
          height: height * scale,
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: 0, // square edges
          overflow: 'hidden',
        }}
      >
        {(
          [
            'title',
            'location',
            'salary',
            'description',
            'benefits',
            'email',
            'phone',
          ] as PlaceholderKey[]
        ).map((key) => {
          const baseSpec = base[key]
          if (!baseSpec) return null
  
          const override = layout.positions[key]
          const fontSize =
            layout.fontSizes[key] ?? baseSpec.fontSize ?? 18
  
          const x = (override?.x ?? baseSpec.x) * scale
          const y = (override?.y ?? baseSpec.y) * scale
          const w = baseSpec.w ? baseSpec.w * scale : undefined
  
          let value: string
          switch (key) {
            case 'title':
              value = job.title || '[JOB TITLE]'
              break
            case 'location':
              value = job.location || '[LOCATION]'
              break
            case 'salary':
              value = job.salary || '[SALARY]'
              break
            case 'description':
              value = job.description || '[SHORT DESCRIPTION]'
              break
            case 'benefits': {
              const tx =
                job.benefits ||
                '[BENEFIT 1]\n[BENEFIT 2]\n[BENEFIT 3]'
              value = tx
                .split('\n')
                .map((l) => `• ${l}`)
                .join('\n')
              break
            }
            case 'email':
              value = job.email || '[EMAIL]'
              break
            case 'phone':
              value = job.phone || '[PHONE NUMBER]'
              break
            default:
              value = ''
          }
  
          const isContact = key === 'email' || key === 'phone'
  
          const textColor =
            key === 'salary'
              ? '#F7941D'
              : region === 'us'
              ? '#3B3E44' // everything on US template dark grey, including email/phone
              : 'white'
  
          const draggable = key !== 'email' && key !== 'phone'
          const dragProps = draggable
            ? makeDragHandlers(jobIndex, key)
            : {}
  
          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                fontSize: fontSize * scale,
                lineHeight: 1.25,
                color: textColor,
                textAlign: baseSpec.align ?? 'left',
                whiteSpace: 'pre-line',
                fontWeight:
                  key === 'title' ||
                  key === 'location' ||
                  key === 'salary' ||
                  key === 'description'
                    ? '700'
                    : '400',
              }}
              {...dragProps}
            >
              {value}
            </div>
          )
        })}
  
        {/* Location icon */}
        {tpl.layout.location && (
          <img
            src={LOCATION_ICON_SRC}
            alt="Location"
            style={{
              position: 'absolute',
              // keep it to the left of the location text
              left:
                ((layout.positions.location?.x ??
                  tpl.layout.location.x) -
                  45) *
                scale,
              // vertically centre icon relative to location text line
              top:
                (
                  (layout.positions.location?.y ??
                    tpl.layout.location.y) +
                  ((layout.fontSizes.location ??
                    tpl.layout.location.fontSize ??
                    30) /
                    2) -
                  8 // half of icon height (32 / 2)
                ) * scale,
              width: 32 * scale,
              height: 32 * scale,
            }}
          />
        )}
      </div>
    )
  }

  function renderCover(
    scale: number,
    ref?: React.Ref<HTMLDivElement>,
  ) {
    const size = tpl.width
    const src = COVER_BY_REGION[region]
    return (
      <div
        ref={ref as any}
        data-jz-export-cover={scale === 1 ? '1' : undefined}
        style={{
          position: 'relative',
          width: size * scale,
          height: size * scale,
          backgroundImage: `url(${src})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: 0, // square edges
          overflow: 'hidden',
        }}
      />
    )
  }

  // --- export: PNGs + PDF --------------------------------------------------

  async function downloadAllPngs() {
    const nodes: HTMLElement[] = []
  
    // Cover (export-sized)
    const coverNode = document.querySelector<HTMLElement>('[data-jz-export-cover="1"]')
    if (coverNode) nodes.push(coverNode)
  
    // All job posters (export-sized)
    const jobNodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-jz-export-job="1"]'),
    )
    nodes.push(...jobNodes)
  
    if (!nodes.length) return
  
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
      })
      const a = document.createElement('a')
      const baseName =
        i === 0
          ? `job-zone-cover-${region}`
          : `job-zone-${i}`
      a.href = canvas.toDataURL('image/png')
      a.download = `${baseName}.png`
      a.click()
    }
  }

  async function downloadPdf() {
    const { jsPDF } = await import('jspdf')
  
    const nodes: HTMLElement[] = []
  
    const coverNode = document.querySelector<HTMLElement>('[data-jz-export-cover="1"]')
    if (coverNode) nodes.push(coverNode)
  
    const jobNodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-jz-export-job="1"]'),
    )
    nodes.push(...jobNodes)
  
    if (!nodes.length) return
  
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [tpl.width, tpl.height],
    })
  
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      if (i > 0) doc.addPage()
      doc.addImage(
        imgData,
        'PNG',
        0,
        0,
        tpl.width,
        tpl.height,
      )
    }
  
    doc.save('job-zone.pdf')
  }

  // --- JSX -----------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      {/* Job IDs + Region */}
      <div className="rounded-2xl border bg-white/70 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-gray-800">
            Job IDs (max 8)
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={region === 'ire' ? pillPrimary : pillSecondary}
              onClick={() => setRegion('ire')}
            >
              IRE
            </button>
            <button
              type="button"
              className={region === 'uk' ? pillPrimary : pillSecondary}
              onClick={() => setRegion('uk')}
            >
              UK
            </button>
            <button
              type="button"
              className={region === 'us' ? pillPrimary : pillSecondary}
              onClick={() => setRegion('us')}
            >
              US
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {jobIds.map((val, idx) => (
            <input
              key={idx}
              value={val}
              onChange={(e) => updateJobId(idx, e.target.value)}
              placeholder={`Job ID ${idx + 1}`}
              className="input input-bordered input-sm w-full text-xs"
            />
          ))}
        </div>

        <button
          type="button"
          onClick={retrieveJobs}
          disabled={loadingJobs}
          className="w-full bg-[#F7941D] hover:bg-[#e98310] text-white font-semibold py-3 rounded-full transition"
        >
          {loadingJobs ? 'Retrieving…' : 'Retrieve'}
        </button>
      </div>

      {/* Editor + preview */}
      {jobs.length > 0 && (
        <div className="rounded-2xl border bg-white/80 p-4 shadow-sm">
          {(() => {
            const safeIndex = Math.min(activeIndex, jobs.length - 1)
            const job = jobs[safeIndex]
            const maxPreviewIndex = jobs.length // 0..N
            const canPrev = previewIndex > 0
            const canNext = previewIndex < maxPreviewIndex

            const changePreview = (next: number) => {
              const clamped = Math.max(0, Math.min(maxPreviewIndex, next))
              setPreviewIndex(clamped)
              if (clamped > 0) setActiveIndex(clamped - 1)
            }

            return (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                {/* Left: job fields */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Job {safeIndex + 1} – [{job.id || 'Job ID'}]
                    </h3>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {/* Title */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                        <span>Job Title</span>
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              adjustFontSize(safeIndex, 'title', -2)
                            }
                            className="px-1 border rounded text-[10px]"
                          >
                            A-
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              adjustFontSize(safeIndex, 'title', +2)
                            }
                            className="px-1 border rounded text-[10px]"
                          >
                            A+
                          </button>
                        </span>
                      </div>
                      <input
                        value={job.title}
                        onChange={(e) =>
                          updateJob(safeIndex, { title: e.target.value })
                        }
                        className="input input-bordered input-xs w-full text-xs"
                      />
                    </div>

                    {/* Location */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                        <span>Location</span>
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              adjustFontSize(safeIndex, 'location', -2)
                            }
                            className="px-1 border rounded text-[10px]"
                          >
                            A-
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              adjustFontSize(safeIndex, 'location', +2)
                            }
                            className="px-1 border rounded text-[10px]"
                          >
                            A+
                          </button>
                        </span>
                      </div>
                      <input
                        value={job.location}
                        onChange={(e) =>
                          updateJob(safeIndex, { location: e.target.value })
                        }
                        className="input input-bordered input-xs w-full text-xs"
                      />
                    </div>

                    {/* Salary */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                        <span>Salary</span>
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              adjustFontSize(safeIndex, 'salary', -2)
                            }
                            className="px-1 border rounded text-[10px]"
                          >
                            A-
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              adjustFontSize(safeIndex, 'salary', +2)
                            }
                            className="px-1 border rounded text-[10px]"
                          >
                            A+
                          </button>
                        </span>
                      </div>
                      <input
                        value={job.salary}
                        onChange={(e) =>
                          updateJob(safeIndex, { salary: e.target.value })
                        }
                        className="input input-bordered input-xs w-full text-xs"
                      />
                    </div>

                    {/* Email (no font controls) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                        <span>Email</span>
                      </div>
                      <input
                        value={job.email}
                        onChange={(e) =>
                          updateJob(safeIndex, { email: e.target.value })
                        }
                        className="input input-bordered input-xs w-full text-xs"
                      />
                    </div>

                    {/* Phone (no font controls) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                        <span>Phone Number</span>
                      </div>
                      <input
                        value={job.phone}
                        onChange={(e) =>
                          updateJob(safeIndex, { phone: e.target.value })
                        }
                        className="input input-bordered input-xs w-full text-xs"
                      />
                    </div>
                  </div>

                  {/* Short Description */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                      <span>Short Description</span>
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            adjustFontSize(safeIndex, 'description', -2)
                          }
                          className="px-1 border rounded text-[10px]"
                        >
                          A-
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            adjustFontSize(safeIndex, 'description', +2)
                          }
                          className="px-1 border rounded text-[10px]"
                        >
                          A+
                        </button>
                      </span>
                    </div>
                    <textarea
                      value={job.description}
                      onChange={(e) =>
                        updateJob(safeIndex, { description: e.target.value })
                      }
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-[#F7941D]"
                    />
                  </div>

                  {/* Benefits */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium text-gray-600">
                      <span>Benefits (one per line)</span>
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            adjustFontSize(safeIndex, 'benefits', -2)
                          }
                          className="px-1 border rounded text-[10px]"
                        >
                          A-
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            adjustFontSize(safeIndex, 'benefits', +2)
                          }
                          className="px-1 border rounded text-[10px]"
                        >
                          A+
                        </button>
                      </span>
                    </div>
                    <textarea
                      value={job.benefits}
                      onChange={(e) =>
                        updateJob(safeIndex, { benefits: e.target.value })
                      }
                      rows={4}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-[#F7941D]"
                    />
                  </div>
                </div>

                {/* Right: preview + exports */}
                <div className="flex flex-col items-center gap-3">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      type="button"
                      onClick={downloadAllPngs}
                      className={pillPrimary}
                    >
                      Download PNGs
                    </button>
                    <button
                      type="button"
                      onClick={downloadPdf}
                      className={pillSecondary}
                    >
                      Download PDF
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      disabled={!canPrev}
                      onClick={() => changePreview(previewIndex - 1)}
                      className="text-2xl px-2 disabled:opacity-30"
                      aria-label="Previous slide"
                    >
                      ‹
                    </button>

                    <div className="flex items-center justify-center">
                      {previewIndex === 0
                        ? renderCover(PREVIEW_SCALE, coverRef)
                        : renderJobPoster(previewIndex - 1, PREVIEW_SCALE)}
                    </div>

                    <button
                      type="button"
                      disabled={!canNext}
                      onClick={() => changePreview(previewIndex + 1)}
                      className="text-2xl px-2 disabled:opacity-30"
                      aria-label="Next slide"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Hidden full-size nodes for export */}
      <div
        style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        {renderCover(1, coverRef)}
        {jobs.map((_, i) =>
          renderJobPoster(
            i,
            1,
            (el: HTMLDivElement | null) => {
              jobExportRefs.current[i] = el
            },
          ),
        )}
      </div>
    </div>
  )
}

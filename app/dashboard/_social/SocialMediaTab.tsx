'use client'

import React, {
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  useEffect,
} from 'react'
import Recorder from '../../_components/recorder'
import html2canvas from 'html2canvas'

type SocialMode = 'jobPosts'

type PlaceholderKey =
  | 'title'
  | 'location'
  | 'salary'
  | 'description'
  | 'benefits'
  | 'email'
  | 'phone'
  | 'video'

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

// brand colours
const BRAND_ORANGE = '#F7941D'
const TSI_RED = '#C6242A' // from TSI-Location-Icon.png

// x = left/right (lower = left | higher = right //
// y = up/down (lower = up | higher = down //

const TEMPLATES: TemplateDef[] = [
  {
    id: 'zitko-1',
    name: 'Zitko – Dark Arcs',
    imageUrl: '/templates/zitko-dark-arc.png',
    width: 1080,
    height: 1080,
    layout: {
      title: { x: 470, y: 300, w: 560, fontSize: 60 },
      location: { x: 520, y: 450, w: 520, fontSize: 30 },
      salary: { x: 520, y: 500, w: 520, fontSize: 28 },
      description: { x: 520, y: 570, w: 520, h: 80, fontSize: 24 },
      benefits: { x: 520, y: 760, w: 520, h: 260, fontSize: 24 },
      email: { x: 800, y: 962, w: 180, fontSize: 20, align: 'left' },
      phone: { x: 800, y: 1018, w: 180, fontSize: 20, align: 'left' },
      // NOTE: no video on zitko-1
    },
  },
  {
    id: 'zitko-2',
    name: 'Zitko – We’re Looking',
    imageUrl: '/templates/zitko-looking.png',
    width: 1080,
    height: 1080,
    layout: {
      title: { x: 40, y: 370, fontSize: 60 },
      location: { x: 95, y: 480, w: 520, fontSize: 30 },
      salary: { x: 95, y: 530, w: 520, fontSize: 28 },
      description: { x: 95, y: 580, w: 520, h: 120, fontSize: 24 },
      benefits: { x: 95, y: 750, w: 520, h: 260, fontSize: 24 },
      email: { x: 800, y: 962, w: 180, fontSize: 20, align: 'left' },
      phone: { x: 800, y: 1018, w: 180, fontSize: 20, align: 'left' },
      video: { x: 705, y: 540, w: 300, h: 300 },
    },
  },
  {
    id: 'zitko-3',
    name: 'TSI - Standard',
    imageUrl: '/templates/TSI-Standard.png',
    width: 1080,
    height: 1080,
    layout: {
      title: { x: 40, y: 320, w: 720, fontSize: 60 },
      location: { x: 80, y: 420, w: 720, fontSize: 30 },
      salary: { x: 80, y: 470, w: 520, fontSize: 28 },
      description: { x: 80, y: 530, w: 620, h: 120, fontSize: 24 },
      benefits: { x: 80, y: 740, w: 610, h: 260, fontSize: 24 },
      email: { x: 800, y: 957, w: 180, fontSize: 20, align: 'left' },
      phone: { x: 800, y: 1018, w: 180, fontSize: 20, align: 'left' },
    },
  },
  {
      id: 'zitko-4',
      name: 'TSI - Video',
      imageUrl: '/templates/TSI-Video.png',
      width: 1080,
      height: 1080,
      layout: {
        title: { x: 40, y: 320, w: 720, fontSize: 60 },
        location: { x: 80, y: 420, w: 720, fontSize: 30 },
        salary: { x: 80, y: 470, w: 520, fontSize: 28 },
        description: { x: 80, y: 530, w: 620, h: 120, fontSize: 24 },
        benefits: { x: 80, y: 740, w: 610, h: 260, fontSize: 24 },
        email: { x: 800, y: 957, w: 180, fontSize: 20, align: 'left' },
        phone: { x: 800, y: 1018, w: 180, fontSize: 20, align: 'left' },
        video: { x: 712, y: 55, w: 300, h: 300 },
      },
    },
  ]

// ---------- shared button styles (pill) ----------
const pillBase =
  'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#F7941D]'

const pillPrimary =
  pillBase +
  ' bg-[#F7941D] text-white hover:bg-[#e98310] disabled:opacity-60 disabled:cursor-not-allowed'

const pillSecondary =
  pillBase +
  ' bg-[#3B3E44] text-white hover:bg-[#2c2f33] disabled:opacity-60 disabled:cursor-not-allowed'

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

// video mask type (now fixed to circle)
type VideoMask = 'circle'

function clipPath(_mask: VideoMask): string {
  // Only one mask for now, but keep helper for future extension
  return 'circle(50% at 50% 50%)'
}

function stripTags(html: string) {
  return String(html ?? '').replace(/<[^>]*>/g, ' ')
}

function extractEmailPhoneFallback(textOrHtml: string) {
  const text = stripTags(textOrHtml)
  const emailMatch = text.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  )
  const phoneCandidates = (
    text.match(/(\+?\d[\d\s().-]{7,}\d)/g) || []
  ).map((s) => s.trim())
  const phoneBest = phoneCandidates.sort((a, b) => b.length - a.length)[0]
  return { email: emailMatch?.[0] ?? '', phone: phoneBest ?? '' }
}

// ---------- main ----------
export default function SocialMediaTab({ mode }: { mode: SocialMode }) {
  const [selectedTplId, setSelectedTplId] = useState(TEMPLATES[0].id)
  const selectedTpl = useMemo(
    () => TEMPLATES.find((t) => t.id === selectedTplId)!,
    [selectedTplId],
  )
  const isTSITemplate = selectedTpl.id === 'zitko-3' || selectedTpl.id === 'zitko-4'

  const videoEnabled =
    selectedTpl.id === 'zitko-2' || selectedTpl.id === 'zitko-4'

  // job data
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

  // video state
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoPublicId, setVideoPublicId] = useState<string | null>(null)
  const [videoMeta, setVideoMeta] = useState<{
    mime: string
    width: number
    height: number
  } | null>(null)
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
      const s =
        Math.min(
          (cw - PAD) / selectedTpl.width,
          (ch - PAD) / selectedTpl.height,
        ) - EPS
      setScale(
        Number.isFinite(s) ? Math.max(0.05, Math.min(1, s)) : 0.4,
      )
    })
    ro.observe(previewBoxRef.current)
    return () => ro.disconnect()
  }, [selectedTpl.width, selectedTpl.height])

  const previewRef = useRef<HTMLDivElement | null>(null)
  const exportRef = useRef<HTMLDivElement | null>(null)

  const [fetchStatus, setFetchStatus] = useState<
    'idle' | 'loading' | 'done' | 'error'
  >('idle')

  // ---------- draggable state for text fields (vertical only) ----------
  const [positions, setPositions] = useState<
    Partial<Record<Exclude<PlaceholderKey, 'video'>, { x: number; y: number }>>
  >({})

  // draggable state for video (free)
  const [videoPos, setVideoPos] = useState<{ x: number; y: number } | null>(
    null,
  )

  // font size overrides
  const [fontSizes, setFontSizes] = useState<
    Partial<Record<Exclude<PlaceholderKey, 'video'>, number>>
  >({})

  // Reset all draggable / size overrides back to template defaults
  const resetLayout = () => {
    setPositions({})
    setVideoPos(null)
    setFontSizes({})
  }

  // Reset positions and font sizes when template changes
  useEffect(() => {
    resetLayout()
  }, [selectedTplId])

  // Clear any video when leaving the video-enabled template
  useEffect(() => {
    if (!videoEnabled) {
      setVideoUrl(null)
      setVideoPublicId(null)
      setVideoMeta(null)
      setVideoPos(null)
    }
  }, [videoEnabled])

  // Only allow vertical movement for text
  function makeDragHandlers(
    key: Exclude<PlaceholderKey, 'email' | 'phone' | 'video'>,
  ) {
    return {
      onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()

        const baseSpec = selectedTpl.layout[key]
        if (!baseSpec) return

        const startY = e.clientY

        const current = positions[key] ?? {
          x: baseSpec.x,
          y: baseSpec.y,
        }

        const handleMove = (ev: MouseEvent) => {
          const dy = (ev.clientY - startY) / scale
          setPositions((prev) => ({
            ...prev,
            [key]: { x: current.x, y: current.y + dy },
          }))
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

  function makeVideoDragHandlers() {
    const videoSpec = selectedTpl.layout.video
    // Do not allow video dragging on Zitko-2
    if (!videoSpec || !videoEnabled) return {}

    return {
      onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()

        const startX = e.clientX
        const startY = e.clientY

        const current =
          videoPos ?? { x: videoSpec.x, y: videoSpec.y }

        const handleMove = (ev: MouseEvent) => {
          const dx = (ev.clientX - startX) / scale
          const dy = (ev.clientY - startY) / scale
          setVideoPos({
            x: current.x + dx,
            y: current.y + dy,
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

  function handleFontSizeChange(
    key: Exclude<PlaceholderKey, 'video'>,
    value: string,
  ) {
    const n = Number(value)
    setFontSizes((prev) => ({
      ...prev,
      [key]: Number.isFinite(n) && n > 0 ? n : undefined,
    }))
  }

  function adjustFontSize(
    key: Exclude<PlaceholderKey, 'video'>,
    delta: number,
  ) {
    setFontSizes((prev) => {
      const base =
        prev[key] ??
        selectedTpl.layout[key]?.fontSize ??
        18
      const next = Math.max(8, base + delta)
      return { ...prev, [key]: next }
    })
  }

  // ------------ data fetch ------------
   async function fetchJob() {
    const id = jobId.trim()
    if (!id) return
    setFetchStatus('loading')
  
    const isTSI =
      selectedTplId === 'zitko-3' || selectedTplId === 'zitko-4'
  
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
            mode: isTSI ? 'tsi' : 'default',   // 👈 NEW
          }),
        })
        if (ai.ok) extracted = await ai.json()
      } catch {}
  
      let shortDesc = ''
      try {
        const teaser = await fetch('/api/job/short-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: publicDesc,
            mode: isTSI ? 'tsi' : 'default',   // 👈 NEW
          }),
        })
        if (teaser.ok) {
          const t = await teaser.json()
          shortDesc = t.description ?? ''
        }
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
        benefits: Array.isArray(extracted?.benefits)
          ? extracted.benefits.join('\n')
          : String(data?.benefits ?? ''),
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

  const benefitsText = useMemo(() => {
    if (Array.isArray(job.benefits))
      return (job.benefits as string[]).join('\n')
    return String(job.benefits || '')
  }, [job.benefits])

  const clearVideo = () => {
    setVideoUrl(null)
    setVideoPublicId(null)
    setVideoMeta(null)
    setVideoOpen(true)
    setVideoPos(null)
  }

  // ---------- render poster (re-used for preview + export) ----------
  function renderPoster(scaleFactor: number, ref?: React.Ref<HTMLDivElement>) {
    const s = scaleFactor

    return (
      <div
        ref={ref}
        className="relative shadow-lg"
        style={{
          width: selectedTpl.width * s,
          height: selectedTpl.height * s,
          backgroundImage: `url(${selectedTpl.imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
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
          ] as const
        ).map((key) => {
          const baseSpec = selectedTpl.layout[key]
          if (!baseSpec) return null

          const isDraggable =
            key !== 'email' &&
            key !== 'phone' &&
            !(selectedTpl.id === 'zitko-2' && key === 'location')

          const override = isDraggable
            ? positions[key as Exclude<PlaceholderKey, 'video'>]
            : undefined

          const effectiveFontSize =
            fontSizes[key as Exclude<PlaceholderKey, 'video'>] ??
            baseSpec.fontSize ??
            18

          const spec = {
            ...baseSpec,
            x: override?.x ?? baseSpec.x,
            y: override?.y ?? baseSpec.y,
            fontSize: effectiveFontSize,
          }

          const dragProps = isDraggable
            ? makeDragHandlers(
                key as Exclude<
                  PlaceholderKey,
                  'email' | 'phone' | 'video'
                >,
              )
            : {}

          const value = (() => {
            switch (key) {
              case 'title':
                return job.title || '[JOB TITLE]'
              case 'location':
                return job.location || '[LOCATION]'
              case 'salary':
                return job.salary || '[SALARY]'
              case 'description':
                return job.description ||
                  (isTSITemplate
                    ? '[RESPONSIBILITY 1]\n[RESPONSIBILITY 2]'
                    : '[SHORT DESCRIPTION]')
              case 'benefits': {
                const tx =
                  (Array.isArray(job.benefits)
                    ? job.benefits.join('\n')
                    : job.benefits) ||
                  '[BENEFIT 1]\n[BENEFIT 2]\n[BENEFIT 3]'
                return tx
                  .split('\n')
                  .map((l) => `• ${l}`)
                  .join('\n\n')
              }
              case 'email':
                return job.email || '[EMAIL]'
              case 'phone':
                return job.phone || '[PHONE NUMBER]'
            }
          })()

          // BENEFITS special rendering (TSI gets heading in red)
          if (key === 'benefits') {
            let benefitsLines: string[] = Array.isArray(job.benefits)
              ? (job.benefits as string[]).map((s) =>
                  String(s).trim(),
                ).filter(Boolean)
              : String(job.benefits || '')
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)

            if (benefitsLines.length === 0) {
              benefitsLines = [
                '[BENEFIT 1]',
                '[BENEFIT 2]',
                '[BENEFIT 3]',
              ]
            }

            return (
              <div
                key={key}
                {...dragProps}
                style={{
                  position: 'absolute',
                  left: spec.x * s,
                  top: spec.y * s,
                  width:
                    (spec.w ?? selectedTpl.width - spec.x - 40) * s,
                  height: spec.h ? spec.h * s : undefined,
                  fontSize: spec.fontSize * s,
                  lineHeight: 1.25,
                  textAlign: spec.align ?? 'left',
                  color: 'white',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  cursor: isDraggable ? 'move' : 'default',
                  userSelect: 'none',
                }}
              >
                {isTSITemplate && (
                  <div
                    style={{
                      fontWeight: 700,
                      color: TSI_RED,
                      marginBottom: `${8 * s}px`,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    BENEFITS
                  </div>
                )}

                {benefitsLines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      paddingLeft: `${16 * s}px`,
                      textIndent: `-${8 * s}px`,
                      whiteSpace: 'pre-wrap',
                      marginBottom: `${8 * s}px`,
                      color: 'white',
                    }}
                  >
                    {`• ${line}`}
                  </div>
                ))}
              </div>
            )
          }

          // DESCRIPTION special rendering for Zitko-3 = RESPONSIBILITIES block
          if (key === 'description' && isTSITemplate) {
            let respLines: string[] = String(
              job.description ||
                '[RESPONSIBILITY 1]\n[RESPONSIBILITY 2]\n[RESPONSIBILITY 3]',
            )
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)

            if (respLines.length === 0) {
              respLines = [
                '[RESPONSIBILITY 1]',
                '[RESPONSIBILITY 2]',
                '[RESPONSIBILITY 3]',
              ]
            }

            return (
              <div
                key={key}
                {...dragProps}
                style={{
                  position: 'absolute',
                  left: spec.x * s,
                  top: spec.y * s,
                  width:
                    (spec.w ?? selectedTpl.width - spec.x - 40) * s,
                  height: spec.h ? spec.h * s : undefined,
                  fontSize: spec.fontSize * s,
                  lineHeight: 1.25,
                  textAlign: spec.align ?? 'left',
                  color: 'white',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  cursor: isDraggable ? 'move' : 'default',
                  userSelect: 'none',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: TSI_RED,
                    marginBottom: `${8 * s}px`,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  RESPONSIBILITIES
                </div>
                {respLines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      paddingLeft: `${16 * s}px`,
                      textIndent: `-${8 * s}px`,
                      whiteSpace: 'pre-wrap',
                      marginBottom: `${8 * s}px`,
                      color: 'white',
                    }}
                  >
                    {`• ${line}`}
                  </div>
                ))}
              </div>
            )
          }

          // generic text rendering
          const isSalary = key === 'salary'
          const textColor =
            isSalary && isTSITemplate
              ? TSI_RED // TSI salary red
              : isSalary
              ? BRAND_ORANGE // other templates salary orange
              : 'white'

          return (
            <div
              key={key}
              {...dragProps}
              style={{
                position: 'absolute',
                left: spec.x * s,
                top: spec.y * s,
                width:
                  (spec.w ?? selectedTpl.width - spec.x - 40) * s,
                height: spec.h ? spec.h * s : undefined,
                fontSize: spec.fontSize * s,
                lineHeight: 1.25,
                whiteSpace: 'pre-wrap',
                textAlign: spec.align ?? 'left',
                color: textColor,
                fontWeight: key === 'title' ? 700 : 500,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                cursor: isDraggable ? 'move' : 'default',
                userSelect: 'none',
              }}
            >
              {value}
            </div>
          )
        })}

        {/* LOCATION icon – linked with [LOCATION] field (hidden for zitko-2) */}
        {selectedTpl.id !== 'zitko-2' &&
          selectedTpl.layout.location &&
          (() => {
            const locSpec = selectedTpl.layout.location
            const locOverride = positions.location
            const locationFontSize =
              fontSizes.location ?? locSpec.fontSize ?? 20
            const textHeight = locationFontSize * 1.25
            const iconSize = 40
            const iconOffsetX = 50
            const iconOffsetY = 15
            const locY = locOverride?.y ?? locSpec.y

            const iconSrc =
              selectedTpl.id === 'zitko-3' || selectedTpl.id === 'zitko-4'
                ? '/templates/TSI-Location-Icon.png'
                : '/templates/Location-Icon.png'

            return (
              <div
                {...makeDragHandlers('location')}
                style={{
                  position: 'absolute',
                  left: (locSpec.x - iconOffsetX) * s,
                  top:
                    (locY +
                      (textHeight - iconSize) +
                      iconOffsetY) * s,
                  width: iconSize * s,
                  height: iconSize * s,
                  cursor: 'move',
                  userSelect: 'none',
                  zIndex: 999,
                }}
              >
                <img
                  src={iconSrc}
                  alt="Location icon"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>
            )
          })()}

        {selectedTpl.layout.video && videoUrl && (
          <div
            {...makeVideoDragHandlers()}
            style={{
              position: 'absolute',
              left:
                (videoPos?.x ?? selectedTpl.layout.video.x) * s,
              top:
                (videoPos?.y ?? selectedTpl.layout.video.y) * s,
              width: selectedTpl.layout.video.w * s,
              height: selectedTpl.layout.video.h * s,
              overflow: 'hidden',
              clipPath: clipPath('circle'),
              background: '#111',
              cursor:
                selectedTpl.id === 'zitko-2'
                  ? 'default'
                  : 'move',
              userSelect: 'none',
            }}
          >
            <video
              src={videoUrl}
              playsInline
              preload="metadata"
              controls
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}
      </div>
    )
  }

  // ---------- download PNG using full-size hidden poster ----------
  async function downloadPng() {
    if (!exportRef.current) return

    const canvas = await html2canvas(exportRef.current, {
      scale: 2,
      useCORS: true,
    })

    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${selectedTpl.id}.png`
    a.click()
  }

  async function downloadMp4() {
    if (!videoPublicId || !videoEnabled) {
      alert('Add a video on the Zitko-2 template first.')
      return
    }

    const payload = {
      videoPublicId,
      title: job.title || 'Job Title',
      location: job.location || 'Location',
      salary: job.salary || 'Salary',
      description: wrapText(
        String(job.description || 'Short description'),
      ),
      benefits: benefitsText,
      email: job.email || '',
      phone: job.phone || '',
      templateId: selectedTplId,
      // Send layout overrides so MP4 matches preview
      positions,
      fontSizes,
      videoPos,
    }

    const res = await fetch('/api/job/download-mp4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const contentType = res.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')

    if (!res.ok) {
      const errPayload = isJson
        ? await res.json().catch(() => ({}))
        : {}
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

  const canDownloadMp4 = !!videoUrl && videoEnabled

  return (
    <div className="flex flex-col gap-4">
      {/* Always Job Posts for now */}
      <h2 className="text-xl font-bold">Job Posts</h2>

      {/* template scroller */}
      <div className="w-full overflow-x-auto border rounded-lg p-3 bg-white">
        <div className="flex gap-3 min-w-max">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTplId(t.id)}
              className={`relative rounded-lg overflow-hidden border ${
                selectedTplId === t.id
                  ? 'ring-2 ring-amber-500'
                  : 'border-gray-200'
              } hover:opacity-90`}
              title={t.name}
            >
              <img
                src={t.imageUrl}
                alt={t.name}
                className="h-28 w-28 object-cover"
              />
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5">
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: recorder + form */}
        <div className="flex flex-col gap-6">
          {/* recorder (collapsible) */}
          <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setVideoOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 border-b"
              aria-expanded={videoOpen}
              aria-controls="video-panel"
            >
              <h3 className="font-semibold text-lg">Video record</h3>
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`${
                  videoOpen ? 'rotate-180' : ''
                } transition-transform`}
              >
                <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.126l3.71-3.896a.75.75 0 1 1 1.08 1.04l-4.24 4.456a.75.75 0 0 1-1.08 0L5.25 8.27a.75.75 0 0 1-.02-1.06z" />
              </svg>
            </button>

            <div
              id="video-panel"
              className={`transition-[max-height] duration-300 ease-in-out ${
                videoOpen ? 'max-h-[1200px]' : 'max-h-0'
              }`}
            >
              <div className="p-4">
                <div className="mt-3">
                  {!videoEnabled && (
                    <p className="text-sm text-gray-500">
                      Video recording is only available for the <strong>Zitko – We’re Looking</strong> and 
                      <strong> Zitko – TSI Video</strong> templates.
                    </p>
                  )}

                  {videoEnabled && (
                    <>
                      {videoUrl ? (
                        <div className="space-y-3">
                          <div className="aspect-video bg-black rounded-lg overflow-hidden">
                            <video
                              src={videoUrl}
                              controls
                              playsInline
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className={pillSecondary}
                              onClick={() => setVideoOpen(false)}
                              title="Hide panel"
                            >
                              Close
                            </button>
                            <button
                              type="button"
                              className={pillPrimary}
                              onClick={clearVideo}
                              title="Remove this video so you can record/upload a new one"
                            >
                              Remove video
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="recorder-slim">
                          <Recorder
                            jobId={jobId || 'unassigned'}
                            onUploaded={(payload: any) => {
                              setVideoUrl(payload.playbackMp4)
                              setVideoPublicId(payload.publicId)
                              setVideoMeta({
                                mime: payload.mime,
                                width: payload.width,
                                height: payload.height,
                              })
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* job details */}
          <section className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold text-lg">Job details</h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                className="border rounded px-3 py-2 sm:col-span-2 text-sm"
                placeholder="Job ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              />
              <button
                className={pillPrimary + ' w-full justify-center'}
                onClick={fetchJob}
                disabled={fetchStatus === 'loading'}
              >
                {fetchStatus === 'loading'
                  ? 'Retrieving…'
                  : fetchStatus === 'done'
                  ? 'Retrieved ✓'
                  : 'Retrieve'}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Job Title"
                value={job.title}
                onChange={(e) =>
                  setJob({ ...job, title: e.target.value })
                }
              />
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Location"
                value={job.location}
                onChange={(e) =>
                  setJob({ ...job, location: e.target.value })
                }
              />
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Salary"
                value={job.salary}
                onChange={(e) =>
                  setJob({ ...job, salary: e.target.value })
                }
              />
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Email"
                value={job.email}
                onChange={(e) =>
                  setJob({ ...job, email: e.target.value })
                }
              />
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Phone Number"
                value={job.phone}
                onChange={(e) =>
                  setJob({ ...job, phone: e.target.value })
                }
              />
              <textarea
                className="border rounded px-3 py-2 sm:col-span-2 min-h-[80px] text-sm"
                placeholder={
                  isTSITemplate
                    ? 'Responsibilities (one per line)'
                    : 'Short Description'
                }
                value={job.description}
                onChange={(e) =>
                  setJob({ ...job, description: e.target.value })
                }
              />
              <textarea
                className="border rounded px-3 py-2 sm:col-span-2 min-h-[80px] text-sm"
                placeholder="Benefits (one per line)"
                value={benefitsText}
                onChange={(e) =>
                  setJob({ ...job, benefits: e.target.value })
                }
              />
            </div>
          </section>

          {/* font size controls */}
          <section className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold text-lg">Font sizes</h3>
            <p className="text-xs text-gray-500 mb-2">
              Adjust text size for each field (template defaults are used
              when left blank).
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  'title',
                  'location',
                  'salary',
                  'description',
                  'benefits',
                ] as const
              ).map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="capitalize">
                    {key === 'salary'
                      ? 'Salary'
                      : key === 'description'
                      ? isTSITemplate
                        ? 'Responsibilities'
                        : 'Description'
                      : key}
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-20 text-xs pr-6"
                      value={
                        fontSizes[
                          key as Exclude<PlaceholderKey, 'video'>
                        ] ?? ''
                      }
                      onChange={(e) =>
                        handleFontSizeChange(
                          key as Exclude<PlaceholderKey, 'video'>,
                          e.target.value,
                        )
                      }
                      placeholder={String(
                        selectedTpl.layout[key]?.fontSize ?? '',
                      )}
                    />
                    {/* inline up/down arrows inside the field */}
                    <div className="absolute inset-y-0 right-0 flex flex-col justify-center mr-1">
                      <button
                        type="button"
                        className="leading-none text-[10px]"
                        onClick={() =>
                          adjustFontSize(
                            key as Exclude<PlaceholderKey, 'video'>,
                            1,
                          )
                        }
                        tabIndex={-1}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="leading-none text-[10px]"
                        onClick={() =>
                          adjustFontSize(
                            key as Exclude<PlaceholderKey, 'video'>,
                            -1,
                          )
                        }
                        tabIndex={-1}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT: preview + export */}
        <div className="border rounded-xl p-4 bg-white">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-lg">Preview</h3>
            <div className="flex gap-2 flex-wrap items-center">
              {/* small circular reset button with arrow icon */}
              <button
                type="button"
                onClick={resetLayout}
                title="Reset layout to template defaults"
                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 bg-white text-[13px] leading-none text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              >
                ↻
              </button>

              <button
                className={pillSecondary}
                onClick={downloadPng}
              >
                Download PNG
              </button>
              <button
                className={
                  pillSecondary +
                  (!canDownloadMp4
                    ? ' opacity-50 cursor-not-allowed'
                    : '')
                }
                onClick={downloadMp4}
                title={
                  canDownloadMp4
                    ? 'Compose MP4 on server'
                    : 'Add a video on Zitko-2 to enable'
                }
                disabled={!canDownloadMp4}
              >
                Download MP4
              </button>
            </div>
          </div>

          <div
            ref={previewBoxRef}
            className="mt-3 h-[64vh] min-h-[420px] w-full overflow-hidden flex items-center justify-center bg-muted/20 rounded-lg"
          >
            {renderPoster(scale, previewRef)}
          </div>

          {/* hidden full-size poster for crisp PNG export */}
          <div
            style={{
              position: 'absolute',
              left: -99999,
              top: -99999,
              opacity: 0,
              pointerEvents: 'none',
            }}
          >
            {renderPoster(1, exportRef)}
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Preview scales the poster to fit; PNG exports at the
            template’s intrinsic size.
          </p>
        </div>
      </div>

      {/* Recorder-specific style tweaks */}
      <style jsx global>{`
        .recorder-slim select {
          height: 2rem;
          font-size: 0.875rem;
          max-width: 280px;
        }
        .recorder-slim input[type='number'] {
          height: 2rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  )
}

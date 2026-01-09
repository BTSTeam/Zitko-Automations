'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export default function SelectMascot() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [pupil, setPupil] = useState({ x: 0, y: 0 }) // px offsets inside eye
  const [lean, setLean] = useState(0) // degrees
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) return

    let raf = 0

    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current
      if (!el) return

      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2

      const dx = e.clientX - cx
      const dy = e.clientY - cy

      // Eyes: map cursor delta to small pupil offsets
      // Keep pupils inside the eye: ~6px radius feels good
      const px = clamp(dx / 60, -6, 6)
      const py = clamp(dy / 80, -5, 5)

      // Lean: map horizontal delta to a subtle bend
      const deg = clamp(dx / 90, -10, 10)

      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setPupil({ x: px, y: py })
        setLean(deg)
      })
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [prefersReducedMotion])

  return (
    <div className="w-full flex justify-center" ref={wrapRef}>
      <div
        className="relative"
        style={{
          width: 140,
          height: 200, // 👈 was 260
          transform: prefersReducedMotion ? undefined : `rotate(${lean}deg)`,
          transformOrigin: '50% 85%',
          transition: prefersReducedMotion ? 'none' : 'transform 80ms linear',
        }}
      >
        {/* Body */}
        <div
          className="absolute inset-0 rounded-[42px] border"
          style={{
            background: '#F7941D',
            borderColor: '#111827',
            borderWidth: 0, // set to 1 if you want an outline like the image
          }}
        />

        {/* Eyes */}
        <div className="absolute top-[48px] left-0 right-0 flex justify-center gap-3">
          <Eye pupilX={pupil.x} pupilY={pupil.y} />
          <Eye pupilX={pupil.x} pupilY={pupil.y} />
        </div>

        {/* Smile */}
        <svg
          className="absolute left-0 right-0"
          style={{ bottom: 46, margin: '0 auto' }}
          width="96"
          height="78"
          viewBox="0 0 96 78"
          fill="none"
        >
          {/* white smile with dark outline feel */}
          <path
            d="M16 20 C 24 62, 72 62, 80 20"
            stroke="#111827"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M16 20 C 24 62, 72 62, 80 20"
            stroke="#FFFFFF"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}

function Eye({ pupilX, pupilY }: { pupilX: number; pupilY: number }) {
  return (
    <div
      className="relative rounded-full border bg-white"
      style={{
        width: 44,
        height: 44,
        borderColor: '#111827',
        borderWidth: 2,
      }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 12,
          height: 12,
          background: '#111827',
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${pupilX}px), calc(-50% + ${pupilY}px))`,
          transition: 'transform 60ms linear',
        }}
      />
    </div>
  )
}

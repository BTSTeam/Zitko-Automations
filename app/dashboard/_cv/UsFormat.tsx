'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  bakeHeaderFooter,
  mapWorkExperiences,
  mapEducation,
  Employment,
  Education,
} from './CvUtils'

/**
 * UsFormat.tsx — full standalone US Résumé editor
 * -------------------------------------------------------
 * - Mirrors the UK version but labeled and exported as “US”
 * - Uses shared CvUtils for helper functions
 * - Includes prefill, Vincere API integration, upload, and preview
 * - Identical logic / styling to UK version
 */

export default function UsFormat(): JSX.Element {
  // ======== UI state ========
  const [candidateId, setCandidateId] = useState('')
  const [candidateName, setCandidateName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rawCandidate, setRawCandidate] = useState<any>(null)
  const [rawWork, setRawWork] = useState<any[]>([])
  const [rawEdu, setRawEdu] = useState<any[]>([])

  const [form, setForm] = useState({
    name: '',
    location: '',
    profile: '',
    keySkills: '',
    employment: [] as Employment[],
    education: [] as Education[],
    additional: {
      drivingLicense: '',
      nationality: '',
      availability: '',
      health: '',
      criminalRecord: '',
      financialHistory: '',
    },
  })

  const [open, setOpen] = useState({
    core: true,
    profile: true,
    skills: true,
    work: true,
    education: true,
    extra: true,
  })

  const toggle = (key: keyof typeof open) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }))

  // ======== Fetch candidate ========
  async function fetchCandidate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vincere/candidate/${candidateId}`)
      if (!res.ok) throw new Error(`Failed to retrieve candidate ${candidateId}`)
      const data = await res.json()
      setRawCandidate(data)
      setRawWork(data?.work_experiences || [])
      setRawEdu(data?.education || [])

      const employment = mapWorkExperiences(data?.work_experiences || [])
      const education = mapEducation(data?.education || [])
      setForm((prev) => ({
        ...prev,
        name: data?.name || '',
        location: data?.city || '',
        profile: data?.summary || '',
        employment,
        education,
      }))
      setCandidateName(data?.name || '')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ======== Upload to Vincere ========
  async function uploadPdf(blob: Blob) {
    try {
      const formData = new FormData()
      formData.append('file', blob, `${candidateName || 'Resume'}_US.pdf`)
      formData.append('candidateId', candidateId)
      const res = await fetch('/api/vincere/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      alert('Resume uploaded successfully to Vincere!')
    } catch (err: any) {
      setError(err.message)
    }
  }

  // ======== Generate preview ========
  const previewRef = useRef<HTMLDivElement>(null)
  async function exportToPdf() {
    if (!previewRef.current) return
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const element = previewRef.current
      const opt = {
        margin: 10,
        filename: `${candidateName || 'Resume'}_US.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('PDF export failed', err)
    }
  }

  return (
    <div className="card p-4 space-y-4">
      {/* Retrieve Candidate */}
      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mt-4">
        <input
          className="input"
          placeholder="Enter Candidate ID"
          value={candidateId}
          onChange={(e) => setCandidateId(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button
          className="btn btn-brand"
          onClick={fetchCandidate}
          disabled={loading || !candidateId}
        >
          {loading ? 'Fetching…' : 'Retrieve Candidate'}
        </button>
        <button
          type="button"
          className="btn btn-grey"
          disabled={!candidateId}
          onClick={exportToPdf}
          title="Export and download PDF"
        >
          Export PDF
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-600">{String(error).slice(0, 300)}</div>
      )}

      {/* Form Sections */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Core Details</h3>
          <button
            className="text-[11px] text-gray-500 underline"
            onClick={() => toggle('core')}
          >
            {open.core ? 'Hide' : 'Show'}
          </button>
        </div>
        {open.core && (
          <div className="grid gap-3 mt-3">
            <label className="grid gap-1">
              <span className="text-[11px] text-gray-500">Name</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] text-gray-500">Location</span>
              <input
                className="input"
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
              />
            </label>
          </div>
        )}
      </section>

      {/* Profile */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Summary</h3>
          <button
            className="text-[11px] text-gray-500 underline"
            onClick={() => toggle('profile')}
          >
            {open.profile ? 'Hide' : 'Show'}
          </button>
        </div>
        {open.profile && (
          <textarea
            className="input min-h-[160px] mt-3"
            value={form.profile}
            onChange={(e) =>
              setForm((f) => ({ ...f, profile: e.target.value }))
            }
          />
        )}
      </section>

      {/* Skills */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Core Skills</h3>
          <button
            className="text-[11px] text-gray-500 underline"
            onClick={() => toggle('skills')}
          >
            {open.skills ? 'Hide' : 'Show'}
          </button>
        </div>
        {open.skills && (
          <textarea
            className="input min-h-[100px] mt-3"
            value={form.keySkills}
            onChange={(e) =>
              setForm((f) => ({ ...f, keySkills: e.target.value }))
            }
          />
        )}
      </section>

      {/* Employment History */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Work Experience</h3>
          <button
            className="text-[11px] text-gray-500 underline"
            onClick={() => toggle('work')}
          >
            {open.work ? 'Hide' : 'Show'}
          </button>
        </div>
        {open.work && (
          <ul className="mt-3 space-y-2 text-sm">
            {form.employment.map((job, i) => (
              <li key={i}>
                <strong>{job.title}</strong> – {job.company}
                <br />
                <span className="text-gray-500">
                  {job.start} – {job.end}
                </span>
                <p className="text-xs mt-1 whitespace-pre-line">
                  {job.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Education */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Education</h3>
          <button
            className="text-[11px] text-gray-500 underline"
            onClick={() => toggle('education')}
          >
            {open.education ? 'Hide' : 'Show'}
          </button>
        </div>
        {open.education && (
          <ul className="mt-3 space-y-2 text-sm">
            {form.education.map((edu, i) => (
              <li key={i}>
                <strong>{edu.course}</strong> – {edu.institution}
                <br />
                <span className="text-gray-500">
                  {edu.start} – {edu.end}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* PDF Preview */}
      <div ref={previewRef} className="border-t mt-6 pt-4">
        <h2 className="font-semibold text-lg mb-2">Preview (US Format)</h2>
        <div className="text-sm leading-relaxed space-y-2">
          <p>
            <strong>{form.name}</strong> — {form.location}
          </p>
          <p>{form.profile}</p>
          <p>
            <strong>Core Skills:</strong> {form.keySkills}
          </p>
        </div>
      </div>
    </div>
  )
}

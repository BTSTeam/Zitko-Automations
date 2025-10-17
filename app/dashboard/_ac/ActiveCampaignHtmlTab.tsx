// app/dashboard/_ac/ActiveCampaignHtmlTab.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

/* ============================ Password Gate ============================ */
function normalizeEnvPw(s: string | undefined | null) {
  const t = String(s ?? '').trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}
const TAB_PW = normalizeEnvPw(process.env.NEXT_PUBLIC_ACTIVE_CAMPAIGN_TAB ?? '')

/* ============================ Types ============================ */
type EditableJob = {
  id: string
  title: string
  salary: string
  location: string
  benefit1: string
  benefit2: string
  benefit3: string
  contactName: string
  contactEmail: string
  contactPhone: string
}

/* ============================ Helpers ============================ */
const EMPTY_JOB = (): EditableJob => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
  title: '',
  salary: '',
  location: '',
  benefit1: '',
  benefit2: '',
  benefit3: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
})

function safe(s: string) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// fallback email/phone scrape if summarize route doesn’t return those
function extractEmailPhoneFallback(text: string) {
  const emailMatch = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)
  const phoneCandidates = (text.match(/(\+?\d[\d\s().-]{7,}\d)/g) || []).map(s => s.trim())
  const phoneBest = phoneCandidates.sort((a, b) => b.length - a.length)[0]
  return { email: emailMatch?.[0] ?? '', phone: phoneBest ?? '' }
}

// NEW: try to infer a contact name near the email/phone or via label
function extractContactNameFallback(text: string, email: string, phone: string) {
  // Labels like "Contact: Jane Doe" / "Recruiter - John Smith"
  const byLabel = text.match(
    /(?:contact|recruiter|hiring manager)[:\s-]+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,2})/i
  )
  if (byLabel?.[1]) return byLabel[1].trim()

  // A few words before the email
  if (email) {
    const i = text.indexOf(email)
    if (i > -1) {
      const left = text.slice(Math.max(0, i - 120), i)
      const m = left.match(/([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,2})\s*$/)
      if (m?.[1]) return m[1].trim()
    }
  }

  // A few words after the phone
  if (phone) {
    const i = text.indexOf(phone)
    if (i > -1) {
      const right = text.slice(i + phone.length, i + phone.length + 120)
      const m = right.match(/^\s*([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,2})/)
      if (m?.[1]) return m[1].trim()
    }
  }

  return ''
}

/* ============================ Component ============================ */
export default function ActiveCampaignHtmlTab() {
  const [unlocked, setUnlocked] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')

  const [jobs, setJobs] = useState<EditableJob[]>([EMPTY_JOB()])

  // Job ID inputs + loading state
  const [jobIds, setJobIds] = useState<string[]>(Array(8).fill(''))
  const [loadingJobs, setLoadingJobs] = useState(false)

  /* ---------------- Password logic ---------------- */
  function tryUnlock(e?: React.FormEvent) {
    e?.preventDefault()
    if (!TAB_PW) return setPwError('Password is not configured.')
    if (pw.trim() === TAB_PW) setUnlocked(true)
    else setPwError('Incorrect password.')
  }

  /* ---------------- Job logic ---------------- */
  function updateJob(idx: number, patch: Partial<EditableJob>) {
    setJobs(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], ...patch }
      return copy
    })
  }

  function removeJob(idx: number) {
    setJobs(prev => prev.filter((_, i) => i !== idx))
  }

  // Retrieve positions by ID → summarize via ChatGPT
  async function retrieveJobs() {
    const ids = jobIds.map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return
    setLoadingJobs(true)

    const collected: EditableJob[] = []
    for (const id of ids) {
      try {
        // 1) Vincere position
        const r = await fetch(`/api/vincere/position/${encodeURIComponent(id)}`, { cache: 'no-store' })
        const data = await r.json()
        const publicDesc: string =
          data?.public_description || data?.publicDescription || data?.description || ''

        // 2) Summarize
        const ai = await fetch('/api/job/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: publicDesc }),
        })

        let extracted: any = {}
        if (ai.ok) extracted = await ai.json()

        // fallback email/phone if missing
        let contactEmail = String(extracted?.contactEmail ?? '').trim()
        let contactPhone = String(extracted?.contactPhone ?? '').trim()
        if (!contactEmail || !contactPhone) {
          const fb = extractEmailPhoneFallback(publicDesc)
          contactEmail = contactEmail || fb.email
          contactPhone = contactPhone || fb.phone
        }

        // contact name from summarize or fallback heuristics
        let contactName = String(extracted?.contactName ?? '').trim()
        if (!contactName) {
          contactName = extractContactNameFallback(publicDesc, contactEmail, contactPhone)
        }

        collected.push({
          id,
          title: String(extracted?.title ?? '').trim(),
          location: String(extracted?.location ?? '').trim(),
          salary: String(extracted?.salary ?? '').trim(),
          benefit1: extracted?.benefits?.[0] ?? '',
          benefit2: extracted?.benefits?.[1] ?? '',
          benefit3: extracted?.benefits?.[2] ?? '',
          contactName,
          contactEmail,
          contactPhone,
        })
      } catch (err) {
        console.error(err)
        alert(`Failed to retrieve or summarize job ${id}`)
      }
    }

    setJobs(collected.length > 0 ? collected : [EMPTY_JOB()])
    setLoadingJobs(false)
  }

  /* ---------------- HTML generation ---------------- */
  const htmlBlocks = useMemo(() => {
    return jobs.map(j => {
      const benefits = [j.benefit1, j.benefit2, j.benefit3]
        .filter(Boolean)
        .map(b => `<li style="color:#ffffff;font-size:16px;line-height:1.4;margin:0 0 6px 0;">${safe(b)}</li>`)
        .join('\n')

      const contactBits = [safe(j.contactName), safe(j.contactEmail), safe(j.contactPhone)]
        .filter(Boolean)
        .join(' | ')

      return `
<tr>
  <td align="left" bgcolor="#3B3E44" style="padding:20px 30px;">
    <p style="color:#ff9a42;font-size:16px;margin:0 0 6px 0;"><strong>${safe(j.title || '(No Title)')}</strong></p>

    <p style="font-size:15px;margin:0 0 4px 0;">
      <b><span style="color:#ff9a42;">Location:</span></b>
      <span style="color:#ffffff;"> ${safe(j.location)}</span>
    </p>

    <p style="font-size:15px;margin:0 0 10px 0;">
      <b><span style="color:#ff9a42;">Salary:</span></b>
      <span style="color:#ffffff;"> ${safe(j.salary)}</span>
    </p>

    <ul style="margin:0 0 12px 0; padding:0 0 0 36px; list-style-type:disc; list-style-position:outside; mso-padding-left-alt:36px;">
      ${benefits}
    </ul>

    <p style="font-size:15px;margin:0;">
      <span style="color:#ff9a42;font-weight:bold;">Contact:</span>
      <span style="color:#f5f5f7;font-weight:normal;">
        ${contactBits}
      </span>
    </p>
  </td>
</tr>`.trim()
    })
  }, [jobs])

  const rowsHtml = useMemo(() => htmlBlocks.join('\n'), [htmlBlocks])

  function copyHtml() {
    if (!rowsHtml) return
    navigator.clipboard
      .writeText(rowsHtml)
      .then(() => alert('HTML rows copied. Paste between <!-- PASTE START/END -->'))
      .catch(() => alert('Failed to copy.'))
  }

  /* ---------------- UI ---------------- */
  if (!unlocked) {
    return (
      <div className="relative min-h-[60vh]">
        <div className="absolute inset-0 grid place-items-center bg-white">
          <form onSubmit={tryUnlock} className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-center mb-4">
              <div className="text-4xl">🔒</div>
              <h2 className="mt-2 text-lg font-semibold">Restricted Area</h2>
              <p className="text-sm text-gray-600">Enter the password to access Active Campaign tools.</p>
            </div>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                className={`rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001961] ${pwError ? 'border-red-500' : ''}`}
                value={pw}
                onChange={e => {
                  setPw(e.target.value)
                  if (pwError) setPwError('')
                }}
                placeholder="••••••••"
                autoFocus
              />
            </label>
            {pwError && <div className="mt-2 text-sm text-red-600">{pwError}</div>}
            <button
              type="submit"
              className="mt-4 w-full rounded-full px-5 py-3 font-medium !bg-[#001961] !text-white hover:opacity-95"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">HTML Builder</h2>

      {/* Job ID Input Strip (8 fields + Retrieve) */}
      <div className="mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {jobIds.map((val, idx) => (
            <input
              key={idx}
              className="rounded-md border px-3 py-2 text-sm"
              placeholder={`Job ID ${idx + 1}`}
              value={val}
              onChange={e => {
                const copy = [...jobIds]
                copy[idx] = e.target.value
                setJobIds(copy)
              }}
            />
          ))}
        </div>
        <button
          onClick={retrieveJobs}
          className="mt-3 w-full rounded-full px-5 py-2 font-medium !bg-[#001961] !text-white hover:opacity-95 disabled:opacity-50"
          disabled={loadingJobs || jobIds.every(id => !id.trim())}
        >
          {loadingJobs ? 'Retrieving…' : 'Retrieve'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Job editor */}
        <div className="border rounded-xl p-4 space-y-6">
          {jobs.map((job, i) => (
            <details key={job.id} className="border rounded-lg bg-gray-50 p-3 relative" open={false}>
              <summary className="cursor-pointer select-none font-medium">
                {job.title ? job.title : `Job ${i + 1}`}
              </summary>

              {jobs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeJob(i)}
                  className="absolute top-2 right-3 text-xs text-red-500 underline"
                  title="Remove this job"
                >
                  Remove
                </button>
              )}

              <div className="mt-3 grid gap-2">
                {/* Job Title */}
                <label className="text-xs text-gray-500">Job Title</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.title}
                  onChange={e => updateJob(i, { title: e.target.value })}
                  placeholder="Job Title"
                />

                {/* Location */}
                <label className="text-xs text-gray-500">Location</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.location}
                  onChange={e => updateJob(i, { location: e.target.value })}
                  placeholder="Location"
                />

                {/* Salary */}
                <label className="text-xs text-gray-500">Salary</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.salary}
                  onChange={e => updateJob(i, { salary: e.target.value })}
                  placeholder="Salary"
                />

                {/* Benefits */}
                <label className="text-xs text-gray-500">Benefits (Top 3)</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.benefit1}
                  onChange={e => updateJob(i, { benefit1: e.target.value })}
                  placeholder="Benefit 1"
                />
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.benefit2}
                  onChange={e => updateJob(i, { benefit2: e.target.value })}
                  placeholder="Benefit 2"
                />
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.benefit3}
                  onChange={e => updateJob(i, { benefit3: e.target.value })}
                  placeholder="Benefit 3"
                />

                {/* CONTACT (extracted) */}
                <label className="text-xs text-gray-500 mt-2">Contact</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.contactName}
                  onChange={e => updateJob(i, { contactName: e.target.value })}
                  placeholder="Name"
                />
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.contactEmail}
                  onChange={e => updateJob(i, { contactEmail: e.target.value })}
                  placeholder="Email"
                  inputMode="email"
                />
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.contactPhone}
                  onChange={e => updateJob(i, { contactPhone: e.target.value })}
                  placeholder="Phone"
                  inputMode="tel"
                />
              </div>
            </details>
          ))}
        </div>

        {/* RIGHT: HTML preview */}
        <div className="border rounded-xl p-4 bg-[#3B3E44] text-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">HTML Preview</h3>
            <button
              onClick={copyHtml}
              disabled={!rowsHtml}
              className="rounded-full px-4 py-2 text-sm font-medium !bg-[#F7941D] !text-white hover:opacity-95 disabled:opacity-50"
            >
              Copy Code
            </button>
          </div>

          <div className="rounded-md bg-transparent p-3 min-h-[240px] overflow-x-auto">
            <div
              dangerouslySetInnerHTML={{
                __html: `<table width="100%" cellspacing="0" cellpadding="0">${rowsHtml}</table>`
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

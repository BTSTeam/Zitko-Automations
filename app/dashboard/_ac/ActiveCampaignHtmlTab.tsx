// app/dashboard/_ac/ActiveCampaignHtmlTab.tsx
'use client'

import { useMemo, useState } from 'react'

/* ============================ Password Gate ============================ */
function normalizeEnvPw(s: string | undefined | null) {
  const t = String(s ?? '').trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}
const RAW_ENV = process.env.NEXT_PUBLIC_ACTIVE_CAMPAIGN_TAB ?? ''
const TAB_PW = normalizeEnvPw(RAW_ENV)

/* ============================ Types ============================ */
type EditableJob = {
  id: string
  title: string
  salary: string
  location: string
  benefit1: string
  benefit2: string
  benefit3: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
}

/* ============================ Helpers ============================ */
const EMPTY_JOB = (): EditableJob => ({
  id: crypto.randomUUID(),
  title: '',
  salary: '',
  location: '',
  benefit1: '',
  benefit2: '',
  benefit3: '',
  ownerName: '',
  ownerEmail: '',
  ownerPhone: '',
})

function safe(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/* ============================ Component ============================ */
export default function ActiveCampaignHtmlTab() {
  const [unlocked, setUnlocked] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [jobs, setJobs] = useState<EditableJob[]>([EMPTY_JOB()])

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

  function addJob() {
    setJobs(prev => [...prev, EMPTY_JOB()]) // add below previous
  }

  function removeJob(idx: number) {
    setJobs(prev => prev.filter((_, i) => i !== idx))
  }

  /* ---------------- HTML generation ---------------- */
  const htmlBlocks = useMemo(() => {
  return jobs.map((j) => {
    // UPDATED benefits markup (no extra margins on <p>, bullets indented via ul padding)
    const benefits = [j.benefit1, j.benefit2, j.benefit3]
    .filter(Boolean)
    .map(
      (b) =>
        `<li style="color:#ffffff;font-size:16px;margin:0 0 6px 0; padding:0;"><p style="color:#ffffff;margin:0;">${safe(
          b
        )}</p></li>`
    )
    .join('\n')

    // UPDATED row with inline left/right padding 30px for alignment
    return `
<tr>
  <td align="left" bgcolor="#333333" style="padding:20px 30px;">
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
        ${safe(j.ownerName)} | ${safe(j.ownerEmail)} | ${safe(j.ownerPhone)}
      </span>
    </p>
  </td>
</tr>`.trim()
  })
}, [jobs])

  const combinedHtml = useMemo(
    () => `<table width="100%" border="0" cellspacing="0" cellpadding="0">\n${htmlBlocks.join(
      '\n'
    )}\n</table>`,
    [htmlBlocks]
  )

  function copyHtml() {
    if (!combinedHtml) return
    navigator.clipboard
      .writeText(combinedHtml)
      .then(() => alert('HTML code copied to clipboard.'))
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
                className={`rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#001961] ${
                  pwError ? 'border-red-500' : ''
                }`}
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

  /* ---------------- Main Screen ---------------- */
  return (
    <div className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">HTML Builder</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Job editor */}
        <div className="border rounded-xl p-4 space-y-8">
          <button
            onClick={addJob}
            className="w-full rounded-full px-5 py-2 font-medium !bg-[#001961] !text-white hover:opacity-95"
          >
            + Add Job
          </button>

          {jobs.map((job, i) => (
            <details key={job.id} className="border rounded-lg bg-gray-50 p-3 relative" open={i === 0}>
              <summary className="cursor-pointer select-none font-medium">
                {job.title ? job.title : `Job ${i + 1}`}
              </summary>
              {jobs.length > 1 && (
                <button
                  onClick={() => removeJob(i)}
                  className="absolute top-2 right-3 text-xs text-red-500 underline"
                >
                  Remove
                </button>
              )}
              <div className="mt-3 grid gap-2">
                <label className="text-xs text-gray-500">Job Title</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.title}
                  onChange={e => updateJob(i, { title: e.target.value })}
                  placeholder="Job Title"
                />

                <label className="text-xs text-gray-500">Location</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.location}
                  onChange={e => updateJob(i, { location: e.target.value })}
                  placeholder="Location"
                />

                <label className="text-xs text-gray-500">Salary</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.salary}
                  onChange={e => updateJob(i, { salary: e.target.value })}
                  placeholder="Salary"
                />

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

                <label className="text-xs text-gray-500">Recruiter (Owner)</label>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.ownerName}
                  onChange={e => updateJob(i, { ownerName: e.target.value })}
                  placeholder="Name"
                />
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.ownerEmail}
                  onChange={e => updateJob(i, { ownerEmail: e.target.value })}
                  placeholder="Email"
                />
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={job.ownerPhone}
                  onChange={e => updateJob(i, { ownerPhone: e.target.value })}
                  placeholder="Phone"
                />
              </div>
            </details>
          ))}
        </div>

        {/* RIGHT: HTML preview */}
        <div className="border rounded-xl p-4">
          <h3 className="font-semibold mb-3">HTML Preview</h3>
          <div className="rounded-md border bg-[#f5f5f7] text-white p-3 min-h-[240px] overflow-x-auto">
            {jobs.length === 0 ? (
              <div className="text-sm opacity-80">Job Title</div>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: combinedHtml }} />
            )}
          </div>

          <button
            onClick={copyHtml}
            disabled={!combinedHtml}
            className="mt-4 rounded-full px-5 py-3 font-medium !bg-[#F7941D] !text-white hover:opacity-95 disabled:opacity-50"
          >
            Copy Code
          </button>
        </div>
      </div>
    </div>
  )
}

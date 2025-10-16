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
type VincereOwner = {
  full_name?: string
  name?: string
  email?: string
  email_address?: string
  phone?: string
  phone_number?: string
  mobile?: string
}

type VincereJob = {
  id?: string
  job_title?: string
  formatted_salary_to?: string
  location?: any
  internal_description?: string
  public_description?: string
  owners?: VincereOwner[] | VincereOwner
  raw?: any
}

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

const EMPTY_EDITABLE = (id = ''): EditableJob => ({
  id,
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

/* ============================ Normalizers ============================ */
function normalizeOwner(owners?: VincereOwner[] | VincereOwner) {
  const arr = Array.isArray(owners) ? owners : owners ? [owners] : []
  const o = arr[0] || {}
  const name = (o.full_name || o.name || '').trim()
  const email = (o.email || o.email_address || '').trim()
  const phone = (o.phone || o.phone_number || o.mobile || '').trim()
  return { name, email, phone }
}

function normalizeLocation(loc?: any, raw?: any) {
  if (typeof loc === 'string') return loc
  if (loc && typeof loc === 'object') {
    const composed =
      loc.city ||
      loc.name ||
      [loc.town, loc.city, loc.state, loc.country].filter(Boolean).join(', ')
    if (composed) return String(composed)
  }
  if (raw && typeof raw === 'object') {
    const rloc =
      raw.location?.city ||
      raw.location?.name ||
      raw.location ||
      raw?.summary_location
    if (typeof rloc === 'string') return rloc
  }
  return ''
}

/* ============================ Component ============================ */
export default function ActiveCampaignHtmlTab() {
  const [unlocked, setUnlocked] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')

  // 8 Job ID inputs
  const [jobIds, setJobIds] = useState<string[]>(Array.from({ length: 8 }, () => ''))

  // Per-ID editable data
  const [jobs, setJobs] = useState<Record<string, EditableJob>>({})
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ---------------- Password logic ---------------- */
  function tryUnlock(e?: React.FormEvent) {
    e?.preventDefault()
    if (!TAB_PW) {
      setPwError('Password is not configured on this deployment.')
      return
    }
    const typed = pw.trim()
    if (typed === TAB_PW) {
      setUnlocked(true)
      setPwError('')
    } else {
      setPwError('Incorrect password. Access denied.')
    }
  }

  /* ---------------- Server calls ---------------- */
  async function fetchJobs(ids: string[]) {
    const res = await fetch('/api/html-build/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ids }),
    })
    if (!res.ok) throw new Error(`Job fetch failed: ${res.status} ${res.statusText}`)
    return (await res.json()) as { jobs: VincereJob[] }
  }

  async function getBenefits(internalDesc: string, publicDesc: string) {
    const res = await fetch('/api/html-build/benefits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_description: internalDesc, public_description: publicDesc }),
    })
    if (!res.ok) throw new Error(`Benefits failed: ${res.status} ${res.statusText}`)
    return (await res.json()) as { benefits: string[] }
  }

  async function lookupOwner(ownerName: string) {
    const res = await fetch('/api/html-build/owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ownerName }),
    })
    if (!res.ok) return { name: ownerName, email: '', phone: '' }
    return (await res.json()) as { name: string; email: string; phone: string }
  }

  /* ---------------- Retrieve flow ---------------- */
  async function handleRetrieve() {
    setLoading(true)
    setError(null)
    try {
      const ids = jobIds.map((s) => s.trim()).filter(Boolean)
      if (ids.length === 0) {
        setError('Please enter at least one Job ID.')
        setLoading(false)
        return
      }

      const { jobs: serverJobs } = await fetchJobs(ids)
      const next: Record<string, EditableJob> = { ...jobs }

      for (const j of serverJobs) {
        const id = String(j.id ?? '')
        if (!id) continue

        const { name: ownerName0, email: ownerEmail0, phone: ownerPhone0 } = normalizeOwner(j.owners)
        let ownerName = ownerName0
        let ownerEmail = ownerEmail0
        let ownerPhone = ownerPhone0

        if (ownerName && (!ownerEmail || !ownerPhone)) {
          const looked = await lookupOwner(ownerName)
          ownerEmail = ownerEmail || looked.email
          ownerPhone = ownerPhone || looked.phone
        }

        const { benefits } = await getBenefits(j.internal_description ?? '', j.public_description ?? '')

        next[id] = {
          id,
          title: j.job_title ?? '',
          salary: j.formatted_salary_to ?? '',
          location: normalizeLocation(j.location, j.raw),
          benefit1: benefits[0] ?? '',
          benefit2: benefits[1] ?? '',
          benefit3: benefits[2] ?? '',
          ownerName: ownerName || '',
          ownerEmail: ownerEmail || '',
          ownerPhone: ownerPhone || '',
        }
      }

      setJobs(next)
      const firstIdx = jobIds.findIndex((x) => x.trim() && next[x.trim()])
      setOpenIdx(firstIdx >= 0 ? firstIdx : null)
    } catch (e: any) {
      setError(e?.message || 'Failed to retrieve jobs.')
    } finally {
      setLoading(false)
    }
  }

  /* ---------------- HTML Output ---------------- */
  function safe(s: string) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  const htmlBlocks: string[] = useMemo(() => {
    const out: string[] = []
    for (const id of jobIds.map((x) => x.trim()).filter(Boolean)) {
      const j = jobs[id]
      if (!j) continue
      const benefits = [j.benefit1, j.benefit2, j.benefit3]
        .filter(Boolean)
        .map((b) => `<li style="color: #ffffff; font-size: 16px;"><p style="color: #ffffff;">${safe(b)}</p></li>`)
        .join('\n        ')

      const block = `
<td align="left" class="esd-block-text es-p10t es-p30r es-p30l" bgcolor="#333333" style="padding-bottom:14px;">
  <p style="color: #ff9a42; font-size: 16px;"><strong>${safe(j.title)}</strong><b>&nbsp;</b></p>
  <p style="color: #ff9a42; font-size: 16px;"><b>Salary:</b> ${safe(j.salary)}</p>
  <p style="color: #ff9a42; font-size: 16px;"><b>Location:&nbsp;</b> ${safe(j.location)}</p>
  <ul>
      ${benefits}
  </ul>
  <p style="color: #ffffff; font-size: 15px;">
    <strong><span style="color:#ff9a42;">Contact:</span><span style="color:#f5f5f7;">
      ${safe(j.ownerName)} | ${safe(j.ownerEmail)} | ${safe(j.ownerPhone)}
    </span></strong>
  </p>
  <p style="color: #ffffff; font-size: 15px;"><br></p>
</td>`.trim()

      out.push(block)
    }
    return out
  }, [jobIds, jobs])

  const combinedHtml = useMemo(() => htmlBlocks.join('\n\n'), [htmlBlocks])

  function copyHtml() {
    if (!combinedHtml) return
    navigator.clipboard
      .writeText(combinedHtml)
      .then(() => {
        alert('HTML code copied to clipboard.')
      })
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
                onChange={(e) => {
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
              className="mt-4 w-full rounded-full px-5 py-3 font-medium !bg-[#001961] !text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001961]"
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
      <h2 className="text-lg font-semibold mb-4">HTML Build</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left panel — Job IDs + Collapsible editors */}
        <div className="border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Enter up to 8 Job IDs</h3>

          <div className="grid grid-cols-1 gap-3">
            {jobIds.map((v, i) => (
              <div key={i} className="grid gap-2">
                <input
                  className="rounded-lg border px-3 py-2 text-sm"
                  value={v}
                  onChange={(e) => {
                    const copy = jobIds.slice()
                    copy[i] = e.target.value
                    setJobIds(copy)
                  }}
                  placeholder={`Job ID #${i + 1}`}
                />

                {/* Collapsible editor for this ID (shown if data exists) */}
                {jobIds[i].trim() && jobs[jobIds[i].trim()] && (
                  <details open={openIdx === i} className="rounded-lg border bg-gray-50 p-3">
                    <summary
                      className="cursor-pointer select-none font-medium"
                      onClick={(e) => {
                        e.preventDefault()
                        setOpenIdx(openIdx === i ? null : i)
                      }}
                    >
                      Edit details for Job ID {jobIds[i].trim()}
                    </summary>

                    <div className="mt-3 grid gap-2">
                      {(() => {
                        const id = jobIds[i].trim()
                        const j = jobs[id]
                        if (!j) return null
                        const update = (patch: Partial<EditableJob>) => {
                          setJobs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
                        }
                        return (
                          <>
                            <label className="text-xs text-gray-500">Job Title</label>
                            <input
                              className="rounded-md border px-3 py-2 text-sm"
                              value={j.title}
                              onChange={(e) => update({ title: e.target.value })}
                            />

                            <label className="text-xs text-gray-500">Salary</label>
                            <input
                              className="rounded-md border px-3 py-2 text-sm"
                              value={j.salary}
                              onChange={(e) => update({ salary: e.target.value })}
                            />

                            <label className="text-xs text-gray-500">Location</label>
                            <input
                              className="rounded-md border px-3 py-2 text-sm"
                              value={j.location}
                              onChange={(e) => update({ location: e.target.value })}
                            />

                            <div className="grid grid-cols-1 gap-2">
                              <label className="text-xs text-gray-500">Benefits (Top 3)</label>
                              <input
                                className="rounded-md border px-3 py-2 text-sm"
                                value={j.benefit1}
                                onChange={(e) => update({ benefit1: e.target.value })}
                              />
                              <input
                                className="rounded-md border px-3 py-2 text-sm"
                                value={j.benefit2}
                                onChange={(e) => update({ benefit2: e.target.value })}
                              />
                              <input
                                className="rounded-md border px-3 py-2 text-sm"
                                value={j.benefit3}
                                onChange={(e) => update({ benefit3: e.target.value })}
                              />
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                              <label className="text-xs text-gray-500">Recruiter (Owner)</label>
                              <input
                                className="rounded-md border px-3 py-2 text-sm"
                                placeholder="Name"
                                value={j.ownerName}
                                onChange={(e) => update({ ownerName: e.target.value })}
                              />
                              <input
                                className="rounded-md border px-3 py-2 text-sm"
                                placeholder="Email"
                                value={j.ownerEmail}
                                onChange={(e) => update({ ownerEmail: e.target.value })}
                              />
                              <input
                                className="rounded-md border px-3 py-2 text-sm"
                                placeholder="Phone"
                                value={j.ownerPhone}
                                onChange={(e) => update({ ownerPhone: e.target.value })}
                              />
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleRetrieve}
            disabled={loading}
            className="mt-4 rounded-full px-5 py-3 font-medium !bg-[#001961] !text-white hover:opacity-95 disabled:opacity-50"
          >
            {loading ? 'Retrieving…' : 'Retrieve'}
          </button>

          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </div>

        {/* Right panel — Live HTML preview + copy */}
        <div className="border rounded-xl p-4">
          <h3 className="font-semibold mb-3">HTML Preview</h3>
          <div className="rounded-md border bg-[#3B3E44] text-white p-3 min-h-[240px]">
            {htmlBlocks.length === 0 ? (
              <div className="text-sm opacity-80">No HTML generated yet.</div>
            ) : (
              <table className="w-full">
                <tbody>
                  {htmlBlocks.map((h, idx) => (
                    <tr key={idx}>
                      <td className="align-top">
                        {/* Render preview */}
                        <div dangerouslySetInnerHTML={{ __html: h }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

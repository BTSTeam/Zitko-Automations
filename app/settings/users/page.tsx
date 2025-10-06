'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Role = 'Admin' | 'User'
type User = {
  id: string
  email: string
  name?: string
  role: Role
  active: boolean
  createdAt: string
  workPhone?: string | null
}

export default function UsersPage() {
  const router = useRouter()

  // auth/role state
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [meEmail, setMeEmail] = useState<string | null>(null)

  // data state
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // create state
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [cEmail, setCEmail] = useState('')
  const [cName, setCName] = useState('')
  const [cRole, setCRole] = useState<Role>('User')
  const [cPassword, setCPassword] = useState('')
  const [cWorkPhone, setCWorkPhone] = useState('')

  // edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [eName, setEName] = useState('')
  const [eRole, setERole] = useState<Role>('User')
  const [eActive, setEActive] = useState(true)
  const [ePassword, setEPassword] = useState('')
  const [eWorkPhone, setEWorkPhone] = useState('')

  // utilities (search + filters)
  const [q, setQ] = useState('')
  const [fltRole, setFltRole] = useState<'All' | Role>('All')
  const [fltStatus, setFltStatus] = useState<'All' | 'Active' | 'Inactive'>('All')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/users', { cache: 'no-store' })
      if (!r.ok) {
        const t = await r.json().catch(() => ({}))
        throw new Error(t?.error || `Failed to load users (${r.status})`)
      }
      const j = await r.json()
      setUsers(j)
    } catch (e: any) {
      setError(e?.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  // check role, then load users only if admin
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' })
        const j = await r.json()
        setMeEmail(j?.email ?? null)
        const admin = j?.role === 'Admin' && j?.active !== false
        setIsAdmin(admin)
        if (admin) await load()
        else setLoading(false)
      } catch {
        setIsAdmin(false)
        setLoading(false)
      }
    }
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startEdit = (u: User) => {
    setEditId(u.id)
    setEName(u.name ?? '')
    setERole(u.role)
    setEActive(u.active)
    setEPassword('')
    setEWorkPhone(u.workPhone ?? '')
  }
  const cancelEdit = () => {
    setEditId(null); setEName(''); setERole('User'); setEActive(true); setEPassword(''); setEWorkPhone('')
  }

  const submitCreate = async () => {
    if (!cEmail || !cPassword) return alert('Email and password are required')
    setCreating(true)
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cEmail,
          name: cName,
          role: cRole,
          password: cPassword,
          workPhone: cWorkPhone, // server normalizes '' -> null
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `Create failed (${r.status})`)
      setShowCreate(false)
      setCEmail(''); setCName(''); setCRole('User'); setCPassword(''); setCWorkPhone('')
      await load()
    } catch (e: any) {
      alert(e?.message || 'Create failed')
    } finally { setCreating(false) }
  }

  const submitEdit = async () => {
    if (!editId) return
    setSaving(true)
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(editId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eName,
          role: eRole,
          active: eActive,
          password: ePassword || undefined,
          workPhone: eWorkPhone, // server normalizes '' -> null
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `Update failed (${r.status})`)
      cancelEdit()
      await load()
    } catch (e: any) {
      alert(e?.message || 'Update failed')
    } finally { setSaving(false) }
  }

  const removeUser = async (id: string) => {
    if (!confirm('Delete this user?')) return
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `Delete failed (${r.status})`)
      await load()
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    }
  }

  // filtered/sorted rows
  const rows = useMemo(() => {
    const text = q.trim().toLowerCase()
    return users
      .filter(u => {
        if (fltRole !== 'All' && u.role !== fltRole) return false
        if (fltStatus !== 'All' && (fltStatus === 'Active') !== !!u.active) return false
        if (!text) return true
        return (
          (u.name ?? '').toLowerCase().includes(text) ||
          u.email.toLowerCase().includes(text) ||
          (u.workPhone ?? '').toLowerCase().includes(text)
        )
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [users, q, fltRole, fltStatus])

  // Not admin view
  if (isAdmin === false) {
    return (
      <div className="grid gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">User Management</h1>
            <button
              aria-label="Close"
              onClick={() => router.back()}
              className="w-8 h-8 grid place-items-center rounded-full border text-gray-600 hover:text-gray-900"
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="text-sm text-gray-600">
            You must be an <strong>Admin</strong> to view this page.
          </div>
          <div className="mt-4">
            <button className="btn btn-grey" onClick={() => router.push('/dashboard')}>Go to Dashboard</button>
          </div>
        </div>
      </div>
    )
  }

  // Admin view
  return (
    <div className="grid gap-6">
      <div className="card rounded-2xl border p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-xl font-semibold">User Management</h1>
          <div className="flex items-center gap-2">
            <button className="btn btn-brand" onClick={() => setShowCreate(v => !v)}>
              {showCreate ? 'Cancel' : 'Create User'}
            </button>
            <button
              aria-label="Close"
              onClick={() => router.back()}
              className="w-9 h-9 grid place-items-center rounded-full border text-gray-600 hover:text-gray-900"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Utilities */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <input
              className="input w-full pl-9"
              placeholder="Search name, email, or No."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
          </div>
          <select className="input w-full sm:w-40" value={fltRole} onChange={e => setFltRole(e.target.value as any)}>
            <option value="All">All roles</option>
            <option value="Admin">Admin</option>
            <option value="User">User</option>
          </select>
          <select className="input w-full sm:w-40" value={fltStatus} onChange={e => setFltStatus(e.target.value as any)}>
            <option value="All">All status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* Create form (collapsible) */}
        {showCreate && (
          <div className="rounded-2xl border p-4 mb-4 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600">Email</label>
              <input className="input mt-1 w-full" value={cEmail} onChange={e=>setCEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600">Name</label>
              <input className="input mt-1 w-full" value={cName} onChange={e=>setCName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600">Role</label>
              <select className="input mt-1 w-full" value={cRole} onChange={e=>setCRole(e.target.value as Role)}>
                <option value="User">User</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">Password</label>
              <input type="password" className="input mt-1 w-full" value={cPassword} onChange={e=>setCPassword(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-gray-600">No.</label>
              <input className="input mt-1 w-full" placeholder="+44…" value={cWorkPhone} onChange={e=>setCWorkPhone(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <button className="btn btn-grey" onClick={submitCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-auto">
          {loading ? (
            <div className="text-sm text-gray-600 p-4">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600 p-4">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-600 p-6 text-center">No users match your filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 px-2 min-w-[180px]">Name</th>
                  <th className="px-2 min-w-[220px]">Email</th>
                  <th className="px-2 w-[120px] text-right">No.</th>
                  <th className="px-2 w-[110px]">Role</th>
                  <th className="px-2 w-[100px]">Active</th>
                  <th className="px-2 w-[180px]">Created</th>
                  <th className="px-2 w-[160px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-gray-50/40">
                {rows.map(u => {
                  const isEditing = editId === u.id
                  return (
                    <tr key={u.id} className="border-b last:border-b-0">
                      <td className="py-2 px-2">
                        {isEditing ? (
                          <input className="input w-full" value={eName} onChange={e=>setEName(e.target.value)} />
                        ) : (
                          <div className="font-medium">{u.name || '—'}</div>
                        )}
                      </td>
                      <td className="px-2">{u.email}</td>
                      <td className="px-2 text-right tabular-nums">
                        {isEditing ? (
                          <input className="input w-full text-right" placeholder="+44…" value={eWorkPhone} onChange={e=>setEWorkPhone(e.target.value)} />
                        ) : (u.workPhone || <span className="text-gray-400">—</span>)}
                      </td>
                      <td className="px-2">
                        {isEditing ? (
                          <select className="input" value={eRole} onChange={e=>setERole(e.target.value as Role)}>
                            <option value="User">User</option>
                            <option value="Admin">Admin</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                              u.role === 'Admin'
                                ? 'bg-[#F7941D]/10 text-[#F7941D] border-[#F7941D]/30'
                                : 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                          >
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="px-2">
                        {isEditing ? (
                          <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={eActive} onChange={e=>setEActive(e.target.checked)} />
                            <span>Active</span>
                          </label>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                              u.active
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {u.active ? 'Yes' : 'No'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 text-gray-700">
                        {new Date(u.createdAt).toLocaleString()}
                      </td>
                      <td className="px-2">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <input
                                type="password"
                                placeholder="New password (optional)"
                                className="input"
                                value={ePassword}
                                onChange={e=>setEPassword(e.target.value)}
                              />
                              <button className="btn btn-brand" onClick={submitEdit} disabled={saving}>
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                              <button className="btn btn-grey" onClick={cancelEdit}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-grey" onClick={() => startEdit(u)}>Edit</button>
                              <button className="btn btn-grey" onClick={() => removeUser(u.id)}>Delete</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

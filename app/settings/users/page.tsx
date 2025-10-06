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
  const [ePassword, setEPassword] = useState('')
  const [eWorkPhone, setEWorkPhone] = useState('')

  // which rows are expanded
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({})

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

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' })
        const j = await r.json()
        const admin = j?.role === 'Admin' && j?.active !== false
        setIsAdmin(admin)
        if (admin) await load()
        else setLoading(false)
      } catch {
        setIsAdmin(false); setLoading(false)
      }
    }
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleOpen = (id: string) =>
    setOpenIds(prev => ({ ...prev, [id]: !prev[id] }))

  const startEdit = (u: User) => {
    setEditId(u.id)
    setEName(u.name ?? '')
    setERole(u.role)
    setEPassword('')
    setEWorkPhone(u.workPhone ?? '')
    setOpenIds(prev => ({ ...prev, [u.id]: true }))
  }
  const cancelEdit = () => {
    setEditId(null); setEName(''); setERole('User'); setEPassword(''); setEWorkPhone('')
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
          workPhone: cWorkPhone,
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
          password: ePassword || undefined,
          workPhone: eWorkPhone,
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

  const removeUser = async (u: User) => {
    if (!confirm(`Delete ${u.name || u.email}?`)) return
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(u.id)}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `Delete failed (${r.status})`)
      await load()
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    }
  }

  // NEW: sort ascending so new users appear at the bottom
  const rows = useMemo(
    () => [...users].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [users]
  )

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
      <div className="card p-6 rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
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

        {/* Create form */}
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

        {/* Users list — no outer border, just horizontal rules */}
        <div className="divide-y divide-gray-200 rounded-2xl">
          {loading ? (
            <div className="text-sm text-gray-600 p-4">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600 p-4">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-600 p-6 text-center">No users found.</div>
          ) : (
            rows.map(u => {
              const isOpen = !!openIds[u.id]
              const isEditing = editId === u.id
              return (
                <div key={u.id} className="p-3 sm:p-4">
                  {/* Top row: arrow + name + ACCESS + date + actions */}
                  <div className="flex items-center gap-3">
                    <button
                      className="w-8 h-8 grid place-items-center rounded-full border text-gray-600 hover:text-gray-900"
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                      onClick={() => toggleOpen(u.id)}
                    >
                      {isOpen ? '▾' : '▸'}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{u.name || '—'}</span>
                        {/* ACCESS LEVEL next to name */}
                        <span
                          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                            u.role === 'Admin'
                              ? 'bg-[#F7941D]/10 text-[#F7941D] border-[#F7941D]/30'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                          title="Access level"
                        >
                          {u.role}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Actions far right */}
                    <div className="flex items-center gap-2">
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
                          <button
                            aria-label="Delete user"
                            title="Delete"
                            className="w-9 h-9 grid place-items-center rounded-xl bg-red-700 hover:bg-red-800 text-white transition"
                            onClick={() => removeUser(u)}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Collapsible content: Email + No. */}
                  {isOpen && (
                    <div className="mt-3 pl-11 grid sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Email</div>
                        {isEditing ? (
                          <input className="input w-full" value={u.email} disabled />
                        ) : (
                          <div className="text-sm">{u.email}</div>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 mb-1">No.</div>
                        {isEditing ? (
                          <input
                            className="input w-full"
                            placeholder="+44…"
                            value={eWorkPhone}
                            onChange={e=>setEWorkPhone(e.target.value)}
                          />
                        ) : (
                          <div className="text-sm">{u.workPhone || '—'}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

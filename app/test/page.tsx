async function getJob() {
  const res = await fetch('/api/vincere/jobs/1', { cache: 'no-store' })
  return res.json()
}

export default async function TestPage() {
  const data = await getJob().catch(() => ({ error: 'Not connected yet.' }))
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Test Vincere Call</h1>
      <pre className="rounded-2xl border p-4 text-sm overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      <p className="text-sm text-gray-600">If you see an auth error, login first.</p>
    </div>
  )
}

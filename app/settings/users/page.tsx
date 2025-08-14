export default function UsersPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold mb-4">User Management</h1>
      <p className="text-gray-600">This is a placeholder. Hook this up to your user store (DB) later.</p>
      <div className="mt-4 overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-600"><th className="py-2">Username</th><th>Email</th><th>Access</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr className="border-t">
              <td className="py-2">Stephen Rosamond</td>
              <td>stephenr@zitko.co.uk</td>
              <td><span className="inline-block px-2 py-0.5 rounded bg-gray-100 border">Admin</span></td>
              <td>06/08/2025</td>
              <td><span className="inline-block px-2 py-0.5 rounded bg-green-100 border">Active</span></td>
              <td>✏️</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { Eye, Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function UsersSettingsPage() {
  await requirePermission("manage_users")

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      include: { roles: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.role.findMany({
      include: { permissions: true },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Settings", href: "/settings" },
  { label: "Users" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Users & Roles</h1>
        <Link href="/settings/users/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-user-btn">
          + Tambah User
        </Link>
      </div>

      {/* Users Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default" style={{ borderBottom: "1px solid var(--border-color)", padding: "16px 20px" }}>
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Users ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium">{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    {user.roles.map((r) => (
                      <span key={r.id} className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground cursor-pointer transition-all capitalize hover:border-primary hover:text-primary" style={{ marginRight: "4px" }}>{r.name}</span>
                    ))}
                  </td>
                  <td>
                    <span className={`status-badge ${user.isActive ? "status-active" : "status-cancelled"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <Link href={`/settings/users/${user.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost"><Pencil size={14} /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Roles */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Roles ({roles.length})</h2>
        </div>
        <div className="p-4 px-5">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "12px" }}>
            {roles.map((role) => (
              <div key={role.id} className="bg-surface rounded-xl border border-default shadow-sm p-6" style={{ padding: "16px" }}>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">Role</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{role.name}</span>
                </div>
                <div className="flex flex-col gap-1" style={{ marginTop: "8px" }}>
                  <span className="text-xs font-medium text-muted uppercase tracking-wide">Permissions</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{role.permissions.length} permissions</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

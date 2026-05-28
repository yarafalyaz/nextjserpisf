export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { updateRole } from "@/actions/roles.actions"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("manage_settings")
  const { id } = await params

  const [role, allPermissions] = await Promise.all([
    prisma.role.findUnique({
      where: { id: Number(id) },
      include: { permissions: true },
    }),
    prisma.permission.findMany({ orderBy: { name: "asc" } }),
  ])

  if (!role) notFound()

  const assignedIds = new Set(role.permissions.map((p) => p.id))

  // Group permissions by prefix
  const grouped = allPermissions.reduce((acc, perm) => {
    const prefix = perm.name.split("_")[0] || "other"
    if (!acc[prefix]) acc[prefix] = []
    acc[prefix].push(perm)
    return acc
  }, {} as Record<string, typeof allPermissions>)

  const updateRoleWithId = updateRole.bind(null, role.id)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Settings", href: "/settings" },
        { label: "Roles", href: "/settings/roles" },
        { label: role.name, href: `/settings/roles/${role.id}` },
        { label: "Edit" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Role: {role.name}</h1>
      </div>

      <form action={updateRoleWithId} className="flex flex-col gap-6">
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
          <div className="flex flex-col gap-4 max-w-md">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium text-foreground">Nama Role</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                defaultValue={role.name}
                className="w-full px-3 py-2.5 rounded-lg border border-default bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
          <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">Assign Permissions</h2>
          <div className="flex flex-col gap-5">
            {Object.entries(grouped).map(([prefix, perms]) => (
              <div key={prefix}>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 capitalize">{prefix}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                  {perms.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-default hover:bg-surface-secondary transition-all cursor-pointer">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={perm.id}
                        defaultChecked={assignedIds.has(perm.id)}
                        className="rounded border-default"
                      />
                      <span className="text-sm text-foreground">{perm.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
            Update Role
          </button>
          <a href={`/settings/roles/${role.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-default transition-all hover:bg-surface-secondary">
            Batal
          </a>
        </div>
      </form>
    </div>
  )
}

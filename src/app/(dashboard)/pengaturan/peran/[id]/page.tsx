export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Peran" }

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("manage_settings")
  const { id } = await params

  const role = await prisma.role.findUnique({
    where: { id: Number(id) },
    include: { permissions: { orderBy: { name: "asc" } }, users: true },
  })

  if (!role) notFound()

  // Group permissions by prefix
  const grouped = role.permissions.reduce((acc, perm) => {
    const prefix = perm.name.split("_")[0] || "other"
    if (!acc[prefix]) acc[prefix] = []
    acc[prefix].push(perm)
    return acc
  }, {} as Record<string, typeof role.permissions>)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Peran", href: "/pengaturan/peran" },
        { label: role.name },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground capitalize">{role.name}</h1>
        <Link href={`/pengaturan/peran/${role.id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          Ubah Peran
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nama</span>
            <p className="text-sm font-medium text-foreground mt-1 capitalize">{role.name}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Guard</span>
            <p className="text-sm font-mono text-foreground mt-1">{role.guardName}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dibuat</span>
            <p className="text-sm text-foreground mt-1">{formatDate(role.createdAt)}</p>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
        <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">
          Hak Akses ({role.permissions.length})
        </h2>
        {role.permissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada hak akses yang ditetapkan</p>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(grouped).map(([prefix, perms]) => (
              <div key={prefix}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 capitalize">{prefix}</h3>
                <div className="flex flex-wrap gap-2">
                  {perms.map((perm) => (
                    <span key={perm.id} className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground">
                      {perm.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
        <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">
          Pengguna dengan Peran ini ({role.users.length})
        </h2>
        {role.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pengguna dengan peran ini</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {role.users.map((user) => (
              <span key={user.id} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-default bg-background">
                {user.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

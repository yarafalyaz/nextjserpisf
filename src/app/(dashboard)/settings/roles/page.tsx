export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { deleteRole } from "@/actions/roles.actions"

export default async function RolesPage() {
  await requirePermission("manage_settings")

  const roles = await prisma.role.findMany({
    include: { permissions: true, users: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dashboard", href: "/" },
        { label: "Settings", href: "/settings" },
        { label: "Roles & Permissions" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Roles & Permissions</h1>
        <Link href="/settings/roles/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          + Tambah Role
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama Role</DetailTableTh>
              <DetailTableTh>Guard</DetailTableTh>
              <DetailTableTh>Permissions</DetailTableTh>
              <DetailTableTh>Users</DetailTableTh>
              <DetailTableTh>Dibuat</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {roles.length === 0 ? (
                <DetailTableRow>
                  <DetailTableTd colSpan={6} className="text-center py-10 text-muted">Belum ada role</DetailTableTd>
                </DetailTableRow>
              ) : (
                roles.map((role) => (
                  <DetailTableRow key={role.id}>
                    <DetailTableTd className="font-medium capitalize">{role.name}</DetailTableTd>
                    <DetailTableTd className="font-mono text-xs">{role.guardName}</DetailTableTd>
                    <DetailTableTd>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {role.permissions.length} permissions
                      </span>
                    </DetailTableTd>
                    <DetailTableTd>{role.users.length} user</DetailTableTd>
                    <DetailTableTd>{formatDate(role.createdAt)}</DetailTableTd>
                    <DetailTableTd>
                      <div className="flex items-center gap-1">
                        <Link href={`/settings/roles/${role.id}`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">
                          Detail
                        </Link>
                        <Link href={`/settings/roles/${role.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">
                          Edit
                        </Link>
                        <form action={async () => {
                          "use server"
                          await deleteRole(role.id)
                        }}>
                          <button type="submit" className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-danger/30 text-danger transition-all hover:bg-danger/10">
                            Hapus
                          </button>
                        </form>
                      </div>
                    </DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>
    </div>
  )
}

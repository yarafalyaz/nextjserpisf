import { Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengguna" }

export default async function UsersPage() {
  await requirePermission("manage_users")

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      include: { roles: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.role.findMany({
      include: { permissions: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pengaturan", href: "/pengaturan" },
  { label: "Pengguna" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pengguna & Peran</h1>
        <Link href="/pengaturan/pengguna/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-user-btn">
          + Tambah Pengguna
        </Link>
      </div>

      {/* Users Table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Pengguna ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama</DetailTableTh>
              <DetailTableTh>Email</DetailTableTh>
              <DetailTableTh>Peran</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {users.map((user) => (
                <DetailTableRow key={user.id}>
                  <DetailTableTd className="font-medium">{user.name}</DetailTableTd>
                  <DetailTableTd>{user.email}</DetailTableTd>
                  <DetailTableTd>
                    {user.roles.map((r) => (
                      <span key={r.id} className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground cursor-pointer transition-all capitalize hover:border-primary hover:text-primary mr-1">{r.name}</span>
                    ))}
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className={`status-badge ${user.isActive ? "status-active" : "status-cancelled"}`}>
                      {user.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
                    <Link href={`/pengaturan/pengguna/${user.id}`} className="button button--ghost button--sm"><Pencil size={14} /></Link>
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Roles */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Peran ({roles.length})</h2>
        </div>
        <div className="p-4 px-5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
            {roles.map((role) => (
              <div key={role.id} className="bg-surface rounded-xl border border-default shadow-sm p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Peran</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{role.name}</span>
                </div>
                <div className="flex flex-col gap-1 mt-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hak Akses</span>
                  <span className="text-[0.9375rem] text-foreground font-medium">{role.permissions.length} hak akses</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

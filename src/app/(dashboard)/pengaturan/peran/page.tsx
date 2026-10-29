export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { EmptyState } from "@/components/ui/empty-state"
import { DeleteButton } from "@/components/ui/delete-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { deleteRole } from "@/actions/roles.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Peran" }

export default async function RolesPage() {
  await requirePermission("manage_roles")

  const roles = await prisma.role.findMany({
    include: { permissions: true, users: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Peran & Hak Akses" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Peran & Izin</h1>
        <CanCreate permission="manage_roles">
          <Link href="/pengaturan/peran/tambah" className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          + Tambah Peran
        </Link>
        </CanCreate>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama Peran</DetailTableTh>
              <DetailTableTh>Pengaman</DetailTableTh>
              <DetailTableTh>Hak Akses</DetailTableTh>
              <DetailTableTh>Pengguna</DetailTableTh>
              <DetailTableTh>Dibuat</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {roles.length === 0 ? (
                <DetailTableRow>
                  <DetailTableTd colSpan={6} className="py-10">
                    <EmptyState title="Belum ada peran" className="py-0" />
                  </DetailTableTd>
                </DetailTableRow>
              ) : (
                roles.map((role) => (
                  <DetailTableRow key={role.id}>
                    <DetailTableTd className="font-medium capitalize">{role.name}</DetailTableTd>
                    <DetailTableTd className="font-mono text-xs">{role.guardName}</DetailTableTd>
                    <DetailTableTd>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {role.permissions.length} hak akses
                      </span>
                    </DetailTableTd>
                    <DetailTableTd>{role.users.length} pengguna</DetailTableTd>
                    <DetailTableTd>{formatDate(role.createdAt)}</DetailTableTd>
                    <DetailTableTd>
                      <div className="flex items-center gap-1">
                        <Link href={entityHref("/pengaturan/peran", role)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">
                          Detail
                        </Link>
                        <Link href={entityEditHref("/pengaturan/peran", role)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all hover:bg-surface-secondary">
                          Ubah
                        </Link>
                        <DeleteButton id={role.id} action={deleteRole} label={`Hapus peran ${role.name}`} />
                      </div>
                    </DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>
      </div>
    </div>
  )
}

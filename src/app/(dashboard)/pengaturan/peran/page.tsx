export const dynamic = "force-dynamic"

import { Plus } from "@/components/ui/fontawesome-icons"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppSearchField } from "@/components/ui/search-field"
import { CanCreate } from "@/components/auth/can-create"
import { toPlain } from "@/lib/utils/serialization"
import { RoleTable, type RoleRow } from "./_components/role-table"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Peran" }

const SYSTEM_ROLE_NAMES = new Set([
  "super_admin",
  "admin",
  "direktur",
  "manajer",
  "keuangan",
  "akuntan",
  "auditor",
])

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string }>
}) {
  await requirePermission("manage_roles")

  const params = await searchParams
  const cari = params.cari

  const where = {
    ...(cari && {
      name: { contains: cari },
    }),
  }

  const [rawRoles, totalPermissions, _totalUsersWithRoles] = await Promise.all([
    prisma.role.findMany({
      where,
      include: {
        permissions: { select: { id: true } },
        users: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.permission.count(),
    prisma.user.count({ where: { roles: { some: {} } } }),
  ])

  const roles: RoleRow[] = rawRoles.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    guardName: r.guardName,
    isSystem: SYSTEM_ROLE_NAMES.has(r.name.toLowerCase()),
    permissionsCount: r.permissions.length,
    usersCount: r.users.length,
    createdAt: r.createdAt,
  }))

  const systemRolesCount = roles.filter((r) => r.isSystem).length
  const customRolesCount = roles.length - systemRolesCount
  const tableData = toPlain(roles)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Peran & Hak Akses" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Peran & Hak Akses (RBAC)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Konfigurasi profil wewenang, pembatasan hak akses (*Segregation of Duties*), dan proteksi izin operasional.
          </p>
        </div>
        <CanCreate permission="manage_roles">
          <Link
            href="/pengaturan/peran/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Peran</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Peran
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {roles.length}
            </span>
            <span className="text-xs text-muted-foreground">profil wewenang</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Peran Bawaan Sistem
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-primary">
              {systemRolesCount}
            </span>
            <span className="text-xs text-muted-foreground">terkunci (aman)</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Peran Kustom
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {customRolesCount}
            </span>
            <span className="text-xs text-muted-foreground">dapat disesuaikan</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Katalog Hak Akses
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              {totalPermissions}
            </span>
            <span className="text-xs text-muted-foreground">izin granular</span>
          </div>
        </div>
      </div>

      {/* Standardized DataTable */}
      <RoleTable
        data={tableData}
        toolbar={
          <AppSearchField
            placeholder="Cari nama peran..."
            action="/pengaturan/peran"
          />
        }
      />
    </div>
  )
}

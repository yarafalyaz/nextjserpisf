export const dynamic = "force-dynamic"

import { Plus } from "@/components/ui/fontawesome-icons"
import { MAX_LIST_ROWS } from "@/lib/constants/list-rows"
import { parsePagination } from "@/lib/utils/pagination"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppSearchField } from "@/components/ui/search-field"
import { CanCreate } from "@/components/auth/can-create"
import { toPlain } from "@/lib/utils/serialization"
import { withListParams } from "@/lib/utils/list-href"
import { UserTable, type UserRow } from "./_components/user-table"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengguna" }

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("manage_users")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { email: { contains: params.cari } },
      ],
    }),
    ...(params.status === "aktif" && { isActive: true }),
    ...(params.status === "nonaktif" && { isActive: false }),
  }

  const [rawUsers, totalUsers, activeCount, inactiveCount, roles] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        roles: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: false } }),
    prisma.role.findMany({
      include: { permissions: true },
      orderBy: { name: "asc" },
      take: MAX_LIST_ROWS,
    }),
  ])

  const users: UserRow[] = rawUsers.map((u) => ({
    id: u.id,
    slug: u.slug,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    roles: u.roles,
  }))

  const tableData = toPlain(users)
  const currentActionPath = "/pengaturan/pengguna"

  const statusChips = [
    { key: "", label: "Semua", count: activeCount + inactiveCount },
    { key: "aktif", label: "Aktif", count: activeCount },
    { key: "nonaktif", label: "Nonaktif", count: inactiveCount },
  ].map((chip) => {
    const isActive = (params.status ?? "") === chip.key
    return (
      <Link
        key={chip.key}
        href={withListParams(currentActionPath, params, { status: chip.key || undefined, halaman: undefined })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{chip.label}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {chip.count}
        </span>
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Pengguna" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Pengguna & Akses Sistem
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Konsol manajemen akun pengguna, otorisasi peran (*RBAC*), dan pengawasan status akses keamanan sistem.
          </p>
        </div>
        <CanCreate permission="manage_users">
          <Link
            href="/pengaturan/pengguna/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-user-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Pengguna</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Pengguna
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {activeCount + inactiveCount}
            </span>
            <span className="text-xs text-muted-foreground">akun terdaftar</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pengguna Aktif
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              {activeCount}
            </span>
            <span className="text-xs text-muted-foreground">bisa login</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Akun Nonaktif
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                inactiveCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
              }`}
            >
              {inactiveCount}
            </span>
            <span className="text-xs text-muted-foreground">akses dicabut</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Peran (RBAC)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-primary">
              {roles.length}
            </span>
            <span className="text-xs text-muted-foreground">profil wewenang</span>
          </div>
        </div>
      </div>

      {/* User Table with Standardized DataTable */}
      <UserTable
        data={tableData}
        total={totalUsers}
        page={page}
        pageSize={pageSize}
        toolbar={
          <AppSearchField
            placeholder="Cari nama atau email pengguna..."
            action={currentActionPath}
          />
        }
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />

      {/* Roles Section (RBAC Quick Card Grid) */}
      <div className="bg-card rounded-lg border border-border shadow-2xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Daftar Peran & Profil Hak Akses ({roles.length})</h2>
            <p className="text-xs text-muted-foreground">Ringkasan cakupan izin wewenang operasional pengguna</p>
          </div>
          <Link
            href="/pengaturan/peran"
            className="text-xs font-medium text-primary hover:underline cursor-pointer"
          >
            Kelola Matriks Peran →
          </Link>
        </div>
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {roles.map((role) => (
              <div
                key={role.id}
                className="bg-background rounded-lg border border-border p-3.5 flex flex-col justify-between gap-3 hover:border-primary/50 transition-colors"
              >
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Peran
                  </span>
                  <span className="text-sm font-bold text-foreground capitalize block">{role.name}</span>
                </div>
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Hak Akses:</span>
                  <span className="font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded">
                    {role.permissions.length} izin
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

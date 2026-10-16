export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref } from "@/lib/utils/entity-url"
import { updateRole } from "@/actions/roles.actions"
import { buildPermissionMatrix } from "@/lib/auth/permission-matrix"
import { PermissionMatrix } from "./_components/permission-matrix"

export const metadata: Metadata = { title: "Izin Peran" }

/**
 * Matriks izin per peran: baris = entitas, kolom = verba aksi.
 *
 * Menulis ke `Role.permissions` lewat `updateRole` — store yang sama dengan halaman
 * daftar (`/ubah`), jadi hanya ada SATU tempat yang menentukan akses efektif.
 * Sebelumnya halaman ini hanya menulis tabel `role_module_access` yang tidak pernah
 * dibaca jalur penegakan, sehingga centangannya tidak berpengaruh apa pun.
 */
export default async function RolePermissionsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("manage_roles")
  const { slug } = await params

  const role = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) =>
        prisma.role.findFirst({
          where: { slug: s },
          include: { users: true, permissions: true },
        }),
      byId: (id) =>
        prisma.role.findUnique({
          where: { id },
          include: { users: true, permissions: true },
        }),
    },
  )
  if (!role) notFound()

  const roleBaseHref = entityHref("/pengaturan/peran", role)

  // Katalog dari DB (hasil seed `MODULES`) supaya UI tidak pernah menampilkan izin yang
  // tidak dikenal penegakan. `select` tanpa kolom DateTime — Prisma 7 + Turbopack RSC
  // melempar RangeError pada serialisasi Date.
  const [modules, permissions] = await Promise.all([
    prisma.module.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        route: true,
        icon: true,
        actions: {
          orderBy: { order: "asc" },
          select: { id: true, key: true, resource: true, permissionKey: true, label: true },
        },
      },
    }),
    prisma.permission.findMany({ select: { id: true, name: true } }),
  ])

  const permissionIdByName = new Map(permissions.map((p) => [p.name, p.id]))
  const checkedPermissionIds = role.permissions.map((p) => p.id)
  const { matrix, missingPermissionKeys } = buildPermissionMatrix(
    modules.map((mod) => ({
      key: mod.key,
      name: mod.name,
      route: mod.route,
      icon: mod.icon,
      actions: mod.actions,
    })),
    permissionIdByName,
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Peran", href: "/pengaturan/peran" },
          { label: role.name, href: roleBaseHref },
          { label: "Izin" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold capitalize text-foreground">
            Izin — {role.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Matriks izin yang berlaku untuk peran ini. Perubahan langsung memengaruhi{" "}
            {role.users.length} pengguna setelah disimpan.
          </p>
        </div>
        <Link
          href={roleBaseHref}
          className="inline-flex items-center justify-center rounded-lg border border-default px-4 py-2 text-sm font-medium transition-all hover:bg-surface-secondary"
        >
          Kembali
        </Link>
      </div>

      <PermissionMatrix
        action={updateRole.bind(null, role.id)}
        roleName={role.name}
        modules={matrix}
        checkedPermissionIds={checkedPermissionIds}
        missingPermissionKeys={missingPermissionKeys}
      />
    </div>
  )
}

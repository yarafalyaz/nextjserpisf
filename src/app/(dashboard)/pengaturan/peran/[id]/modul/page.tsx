export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ICON_MAP } from "@/lib/auth/modules"
import { toggleModuleAccess } from "@/actions/module-access.actions"
import { ChevronRight, Check, X } from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Modul Peran" }

export default async function RoleModulesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("manage_settings")
  const { id } = await params
  const roleId = Number(id)
  if (Number.isNaN(roleId)) notFound()

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { users: true },
  })
  if (!role) notFound()

  // Fetch all modules with their actions + the role's existing access.
  // Use `select` to exclude DateTime fields — Prisma 7 + Turbopack RSC
  // serializer hits a `toISOString` RangeError on Date columns.
  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      parentKey: true,
      route: true,
      icon: true,
      order: true,
      actions: {
        orderBy: { order: "asc" },
        select: { id: true, key: true, permissionKey: true, label: true, order: true },
      },
    },
  })
  const accessRows = await prisma.roleModuleAccess.findMany({
    where: { roleId },
    select: { moduleActionId: true, allowed: true },
  })
  // Build a quick lookup map: `${moduleActionId}` -> allowed
  const accessMap = new Map<number, boolean>()
  for (const row of accessRows) {
    accessMap.set(row.moduleActionId, row.allowed)
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Peran", href: "/pengaturan/peran" },
          { label: role.name },
          { label: "Modul" },
        ]}
      />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground capitalize">
            Modul & Hak Akses — {role.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centang modul & aksi yang diizinkan untuk peran ini. Perubahan
            langsung berlaku untuk {role.users.length} pengguna.
          </p>
        </div>
        <Link
          href={`/pengaturan/peran/${role.id}`}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-default transition-all hover:bg-surface-secondary"
        >
          <ChevronRight className="size-4 rotate-180" />
          Kembali
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="divide-y divide-default">
          {modules.map((mod) => {
            const Icon = mod.icon ? ICON_MAP[mod.icon] : null
            return (
              <div key={mod.id} className="p-4 lg:p-5">
                <div className="flex items-center gap-3 mb-3">
                  {Icon && <Icon className="size-5 text-primary" />}
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">
                    {mod.name}
                  </h2>
                  {mod.route && (
                    <code className="text-xs text-muted-foreground font-mono">
                      {mod.route}
                    </code>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {mod.actions.map((action) => {
                    const allowed = accessMap.get(action.id) ?? false
                    return (
                      <form
                        key={action.id}
                        action={toggleModuleAccess}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-default bg-background hover:bg-surface-secondary transition-colors"
                      >
                        <input type="hidden" name="roleId" value={roleId} />
                        <input
                          type="hidden"
                          name="moduleActionId"
                          value={action.id}
                        />
                        <input
                          type="hidden"
                          name="allowed"
                          value={allowed ? "0" : "1"}
                        />
                        <input
                          type="hidden"
                          name="returnTo"
                          value={`/pengaturan/peran/${roleId}/modul`}
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-medium text-foreground truncate">
                            {action.label}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono truncate">
                            {action.permissionKey}
                          </span>
                        </div>
                        <button
                          type="submit"
                          aria-label={allowed ? "Cabut" : "Izinkan"}
                          className={cn(
                            "size-8 shrink-0 rounded-md flex items-center justify-center transition-all",
                            allowed
                              ? "bg-primary/15 text-primary hover:bg-danger/15 hover:text-danger"
                              : "bg-surface-secondary text-muted-foreground hover:bg-primary/15 hover:text-primary",
                          )}
                        >
                          {allowed ? (
                            <Check className="size-4" />
                          ) : (
                            <X className="size-4" />
                          )}
                        </button>
                      </form>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}

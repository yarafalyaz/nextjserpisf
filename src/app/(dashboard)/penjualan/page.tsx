import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid } from "@/components/ui/module-grid"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penjualan" }



export default async function SalesPage() {
  const user = await requireAnyPermission(groupPermissions("/penjualan"))
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Penjualan" }]} />
      <h1 id="penjualan-heading" className="text-2xl font-bold text-foreground">
        Penjualan
      </h1>
      <ModuleGrid
        ariaLabel="Modul Penjualan"
        headingId="penjualan-heading"
        items={moduleItemsForGroup("/penjualan")}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}

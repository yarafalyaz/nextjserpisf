import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid } from "@/components/ui/module-grid"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Inventaris" }



export default async function InventoryPage() {
  const user = await requireAnyPermission(groupPermissions("/inventaris"))
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Inventaris" }]} />
      <h1 id="inventaris-heading" className="text-2xl font-bold text-foreground">
        Inventaris
      </h1>
      <ModuleGrid
        ariaLabel="Modul Inventaris"
        headingId="inventaris-heading"
        items={moduleItemsForGroup("/inventaris")}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}

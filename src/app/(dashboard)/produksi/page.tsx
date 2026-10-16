import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid } from "@/components/ui/module-grid"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Manufaktur" }



export default async function ManufacturingPage() {
  const user = await requireAnyPermission(groupPermissions("/produksi"))
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Manufaktur" }]} />
      <h1 id="manufaktur-heading" className="text-2xl font-bold text-foreground">
        Manufaktur
      </h1>
      <ModuleGrid
        ariaLabel="Modul Manufaktur"
        headingId="manufaktur-heading"
        items={moduleItemsForGroup("/produksi")}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}

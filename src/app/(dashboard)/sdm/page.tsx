import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid } from "@/components/ui/module-grid"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "SDM" }



export default async function HrmPage() {
  const user = await requireAnyPermission(groupPermissions("/sdm"))
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "SDM" }]} />
      <h1 id="sdm-heading" className="text-2xl font-bold text-foreground">
        SDM
      </h1>
      <ModuleGrid
        ariaLabel="Modul SDM"
        headingId="sdm-heading"
        items={moduleItemsForGroup("/sdm")}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}

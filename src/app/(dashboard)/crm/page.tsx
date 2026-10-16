import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid } from "@/components/ui/module-grid"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "CRM" }



export default async function CrmPage() {
  const user = await requireAnyPermission(groupPermissions("/crm"))
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "CRM" }]} />
      <h1 id="crm-heading" className="text-2xl font-bold text-foreground">
        CRM
      </h1>
      <ModuleGrid
        ariaLabel="Modul CRM"
        headingId="crm-heading"
        items={moduleItemsForGroup("/crm")}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}

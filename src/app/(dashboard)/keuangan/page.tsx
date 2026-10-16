import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid } from "@/components/ui/module-grid"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Keuangan" }



export default async function FinancePage() {
  const user = await requireAnyPermission(groupPermissions("/keuangan"))
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Keuangan" }]} />
      <h1 id="keuangan-heading" className="text-2xl font-bold text-foreground">
        Keuangan
      </h1>
      <ModuleGrid
        ariaLabel="Modul Keuangan"
        headingId="keuangan-heading"
        items={moduleItemsForGroup("/keuangan")}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}

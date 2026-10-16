import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid } from "@/components/ui/module-grid"
import { moduleItemsForGroup, groupPermissions } from "@/components/layout/module-cards"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pembelian" }



export default async function PurchasePage() {
  const user = await requireAnyPermission(groupPermissions("/pembelian"))
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pembelian" }]} />
      <h1 id="pembelian-heading" className="text-2xl font-bold text-foreground">
        Pembelian
      </h1>
      <ModuleGrid
        ariaLabel="Modul Pembelian"
        headingId="pembelian-heading"
        items={moduleItemsForGroup("/pembelian")}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}

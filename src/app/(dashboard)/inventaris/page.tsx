import {
  BarChart3, Scale, ArrowLeftRight, Wrench, Grid3X3
} from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Inventaris" }

const inventoryModules: ModuleItem[] = [
  { label: "Mutasi Stok", href: "/inventaris/mutasi-stok", icon: BarChart3, desc: "Pergerakan stok", permission: "view_stock_moves" },
  { label: "Penyesuaian", href: "/inventaris/penyesuaian", icon: Scale, desc: "Penyesuaian stok", permission: "view_stock_adjustments" },
  { label: "Transfer", href: "/inventaris/transfer", icon: ArrowLeftRight, desc: "Transfer antar gudang", permission: "view_inventory_transfers" },
  { label: "Pengeluaran Material", href: "/inventaris/pengeluaran-material", icon: Wrench, desc: "Pengeluaran material", permission: "view_material_issues" },
  { label: "Rak", href: "/inventaris/rak", icon: Grid3X3, desc: "Kelola rak gudang", permission: "view_inventory" },
]

const INVENTORY_PERMISSIONS = [
  "view_stock_moves",
  "view_stock_adjustments",
  "view_inventory_transfers",
  "view_material_issues",
  "view_inventory",
]

export default async function InventoryPage() {
  const user = await requireAnyPermission(INVENTORY_PERMISSIONS)
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
        items={inventoryModules}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}

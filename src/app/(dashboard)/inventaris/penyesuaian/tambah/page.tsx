export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { StockAdjustmentForm } from "@/components/forms/stock-adjustment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateAdjustmentPage() {
  await requirePermission("create_stock_adjustments")

  const [warehouses, items] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, qtyOnHand: true, cost: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Inventaris",href:"/inventaris"},{label:"Penyesuaian",href:"/inventaris/penyesuaian"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Stock Adjustment</h1>
      </div>
      <StockAdjustmentForm warehouses={warehouses} items={JSON.parse(JSON.stringify(items))} />
    </div>
  )
}

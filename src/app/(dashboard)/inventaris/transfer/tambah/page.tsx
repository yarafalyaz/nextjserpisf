export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { InventoryTransferForm } from "@/components/forms/inventory-transfer-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateTransferPage() {
  await requirePermission("create_inventory_transfers")

  const [warehouses, items] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, qtyOnHand: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Inventory", href: "/inventaris" },
  { label: "Transfers", href: "/inventaris/transfer" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Inventory Transfer</h1>
      </div>
      <InventoryTransferForm warehouses={warehouses} items={JSON.parse(JSON.stringify(items))} />
    </div>
  )
}

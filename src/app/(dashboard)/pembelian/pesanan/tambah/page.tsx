export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PurchaseOrderForm } from "@/components/forms/purchase-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreatePurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ prId?: string }>
}) {
  await requirePermission("create_purchase_orders")
  const params = await searchParams

  const [vendors, items] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, cost: true, unitOfMeasure: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Pesanan",href:"/pembelian/pesanan"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Purchase Order</h1>
      </div>
      <PurchaseOrderForm
        vendors={vendors}
        items={JSON.parse(JSON.stringify(items))}
        defaultPrId={params.prId ? Number(params.prId) : undefined}
      />
    </div>
  )
}

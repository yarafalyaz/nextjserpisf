export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { GoodsReceiptForm } from "@/components/forms/goods-receipt-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>
}) {
  await requirePermission("create_goods_receipts")
  const params = await searchParams

  const [purchaseOrders, warehouses] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["ordered", "approved"] } },
      include: { vendor: true, items: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Penerimaan Barang",href:"/pembelian/penerimaan"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Penerimaan Barang</h1>
      </div>
      <GoodsReceiptForm
        purchaseOrders={JSON.parse(JSON.stringify(purchaseOrders))}
        warehouses={warehouses}
        defaultPoId={params.poId ? Number(params.poId) : undefined}
      />
    </div>
  )
}

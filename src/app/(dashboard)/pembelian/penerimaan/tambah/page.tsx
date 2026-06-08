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

  const [purchaseOrders, warehouses, itemRecords] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["ordered", "approved"] } },
      include: { vendor: true, items: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        sku: true,
        trackBatch: true,
        trackSerial: true,
        unitOfMeasure: true,
        uomConversions: { select: { code: true, factorToBase: true } },
      },
    }),
  ])

  const itemMap = new Map(
    itemRecords.map((i) => [
      i.id,
      {
        name: i.name,
        sku: i.sku,
        trackBatch: i.trackBatch,
        trackSerial: i.trackSerial,
        unitOfMeasure: i.unitOfMeasure,
        uomConversions: i.uomConversions.map((u) => ({ code: u.code, factorToBase: Number(u.factorToBase) })),
      },
    ])
  )

  const purchaseOrderOptions = purchaseOrders.map((po) => ({
    id: po.id,
    documentNo: po.documentNo,
    vendor: po.vendor ? { name: po.vendor.name } : undefined,
    items: po.items.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      receivedQty: Number(item.receivedQty),
      item: itemMap.get(item.itemId) ?? {
        name: "",
        sku: "",
        trackBatch: false,
        trackSerial: false,
        unitOfMeasure: "PCS",
        uomConversions: [],
      },
    })),
  }))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Penerimaan Barang",href:"/pembelian/penerimaan"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Penerimaan Barang</h1>
      </div>
      <GoodsReceiptForm
        purchaseOrders={JSON.parse(JSON.stringify(purchaseOrderOptions))}
        warehouses={warehouses}
        defaultPoId={params.poId ? Number(params.poId) : undefined}
      />
    </div>
  )
}

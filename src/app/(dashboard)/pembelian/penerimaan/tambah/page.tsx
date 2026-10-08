export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { GoodsReceiptForm } from "@/components/forms/goods-receipt-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Penerimaan Barang" }

export default async function CreateGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>
}) {
  await requirePermission("create_goods_receipts")
  const params = await searchParams

  const [purchaseOrders, warehouses, racks, rackRows, itemRecords, receivedGrItems] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["ordered", "approved"] } },
      include: { vendor: true, items: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.warehouse.findMany({ where: { isActive: true , deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.rack.findMany({
      orderBy: { name: "asc" },
      select: { id: true, warehouseId: true, name: true, code: true },
    }),
    prisma.rackRow.findMany({
      orderBy: { name: "asc" },
      select: { id: true, rackId: true, name: true, code: true },
    }),
    prisma.item.findMany({ where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        trackBatch: true,
        trackSerial: true,
        unitOfMeasure: true,
        defaultWarehouseId: true,
        defaultRackId: true,
        defaultRackRowId: true,
        uomConversions: { select: { code: true, factorToBase: true } },
      },
    }),
    // Real received qty per PO+item. PurchaseOrderItem.receivedQty is a dead
    // column (never written), so "sisa" must be derived from the goods receipts
    // themselves — otherwise every PO looks fully un-received even after it has
    // been (partially) received. Exclude cancelled receipts.
    prisma.goodsReceiptItem.findMany({
      where: {
        goodsReceipt: { status: { not: "cancelled" } },
      },
      select: {
        itemId: true,
        qty: true,
        uom: true,
        goodsReceipt: { select: { purchaseOrderId: true } },
      },
    }),
  ])

  // Aggregate received qty, converted to each item's BASE unit (the PO unit),
  // keyed by `${purchaseOrderId}:${itemId}` — mirrors the verify hook's math.
  const convByItem = new Map(
    itemRecords.map((i) => [
      i.id,
      new Map(i.uomConversions.map((u) => [u.code, Number(u.factorToBase)])),
    ]),
  )
  const unitByItem = new Map(itemRecords.map((i) => [i.id, i.unitOfMeasure]))
  const receivedByPoItem = new Map<string, number>()
  for (const grItem of receivedGrItems) {
    const base = unitByItem.get(grItem.itemId) ?? "PCS"
    const factor =
      grItem.uom && grItem.uom !== base
        ? convByItem.get(grItem.itemId)?.get(grItem.uom) ?? 1
        : 1;
    const key = `${grItem.goodsReceipt.purchaseOrderId}:${grItem.itemId}`
    receivedByPoItem.set(
      key,
      (receivedByPoItem.get(key) ?? 0) + Number(grItem.qty) * (factor > 0 ? factor : 1),
    )
  }

  const itemMap = new Map(
    itemRecords.map((i) => [
      i.id,
      {
        name: i.name,
        sku: i.sku,
        trackBatch: i.trackBatch,
        trackSerial: i.trackSerial,
        unitOfMeasure: i.unitOfMeasure,
        defaultWarehouseId: i.defaultWarehouseId,
        defaultRackId: i.defaultRackId,
        defaultRackRowId: i.defaultRackRowId,
        uomConversions: i.uomConversions.map((u) => ({ code: u.code, factorToBase: Number(u.factorToBase) })),
      },
    ])
  )

  const purchaseOrderOptions = purchaseOrders.map((po) => ({
    id: po.id,
    documentNo: po.documentNo,
    vendor: po.vendor ? { name: po.vendor.name } : undefined,
    // Landed-cost preview inputs: the PO's order-time freight estimate and the
    // header discount rollup, plus each line's net value (allocation weight).
    shippingCost: Number(po.shippingCost),
    serviceFee: Number(po.serviceFee),
    discount: Number(po.discount),
    items: po.items.map((item) => ({
      id: item.id,
      itemId: item.itemId,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
      // Sisa = ordered − actually received (from GRs), NOT the dead PO column.
      receivedQty: receivedByPoItem.get(`${po.id}:${item.itemId}`) ?? 0,
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
        racks={racks}
        rackRows={rackRows}
        defaultPoId={params.poId ? Number(params.poId) : undefined}
      />
    </div>
  )
}

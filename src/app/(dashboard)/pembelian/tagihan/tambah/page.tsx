export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VendorBillForm } from "@/components/forms/vendor-bill-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { GoodsReceiptLinkFields } from "../_components/gr-link-fields"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Tagihan" }

export default async function CreateVendorBillPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string; grId?: string }>
}) {
  await requirePermission("create_vendor_bills")

  const params = await searchParams
  const preselectedPoId = params.poId ? Number(params.poId) : null
  const preselectedGrId = params.grId ? Number(params.grId) : null

  const [vendors, items, purchaseOrders, withholdingTypes] = await Promise.all([
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
    prisma.purchaseOrder.findMany({
      where: { status: { notIn: ["cancelled"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentNo: true,
        vendorId: true,
        isService: true,
        grandTotal: true,
      },
    }),
    prisma.withholdingTaxType.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, name: true, rate: true },
    }),
  ])

  // "Buat Tagihan dari Penerimaan": baris tagihan di-prefill dari baris
  // penerimaan (qty & biaya satuan apa adanya) dan penerimaannya dikirim lewat
  // `goodsReceiptId` supaya VendorBill.goodsReceiptId +
  // VendorBillItem.goodsReceiptItemId terisi — tanpa itu laporan Diterima Belum
  // Ditagih menghitung 0 untuk penerimaan ini.
  //
  // Hanya penerimaan yang sudah diverifikasi/selesai yang bisa ditagih (draft
  // belum menambah stok maupun membersihkan akun clearing; createVendorBill
  // menolaknya juga, jadi tombolnya pun tidak menawarkan GR draft).
  const goodsReceipt = preselectedGrId
    ? await prisma.goodsReceipt.findUnique({
        where: { id: preselectedGrId },
        select: {
          id: true,
          status: true,
          purchaseOrderId: true,
          purchaseOrder: { select: { vendorId: true } },
          items: {
            orderBy: { id: "asc" },
            select: { itemId: true, qty: true, unitCost: true },
          },
        },
      })
    : null

  const billableGr =
    goodsReceipt && ["verified", "completed"].includes(goodsReceipt.status)
      ? goodsReceipt
      : null

  // Pre-fill provider + PO when arriving from a PO's "Buat Tagihan" shortcut.
  const preselectedPo = preselectedPoId
    ? purchaseOrders.find((po) => po.id === preselectedPoId) ?? null
    : null

  const billPrefill = billableGr
    ? {
        id: 0,
        vendorId: billableGr.purchaseOrder.vendorId,
        purchaseOrderId: billableGr.purchaseOrderId,
        date: "",
        items: billableGr.items
          .filter((line) => Number(line.qty) > 0)
          .map((line) => ({
            itemId: line.itemId,
            qty: Number(line.qty),
            unitPrice: Number(line.unitCost),
            discountPercent: 0,
            taxPercent: 0,
          })),
      }
    : preselectedPo
      ? {
          id: 0,
          vendorId: preselectedPo.vendorId,
          purchaseOrderId: preselectedPo.id,
          date: "",
          items: [],
        }
      : undefined

  const form = (
    <VendorBillForm
      vendors={vendors}
      items={JSON.parse(JSON.stringify(items))}
      purchaseOrders={purchaseOrders.map((po) => ({
        id: po.id,
        documentNo: po.documentNo,
        vendorId: po.vendorId,
        isService: po.isService,
        grandTotal: Number(po.grandTotal),
      }))}
      withholdingTypes={withholdingTypes.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
      bill={billPrefill}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{ label: "Tagihan Pemasok", href: "/pembelian/tagihan" },{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Tagihan Pemasok</h1>
      </div>
      {billableGr ? (
        <GoodsReceiptLinkFields goodsReceiptId={billableGr.id}>{form}</GoodsReceiptLinkFields>
      ) : (
        form
      )}
    </div>
  )
}

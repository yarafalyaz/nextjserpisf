export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VendorBillForm } from "@/components/forms/vendor-bill-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Tagihan" }

export default async function CreateVendorBillPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>
}) {
  await requirePermission("create_vendor_bills")

  const params = await searchParams
  const preselectedPoId = params.poId ? Number(params.poId) : null

  const [vendors, items, purchaseOrders] = await Promise.all([
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
  ])

  // Pre-fill provider + PO when arriving from a PO's "Buat Tagihan" shortcut.
  const preselectedPo = preselectedPoId
    ? purchaseOrders.find((po) => po.id === preselectedPoId) ?? null
    : null

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Tagihan",href:"/pembelian/tagihan"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Tagihan Vendor</h1>
      </div>
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
        bill={
          preselectedPo
            ? {
                id: 0,
                vendorId: preselectedPo.vendorId,
                purchaseOrderId: preselectedPo.id,
                date: "",
                items: [],
              }
            : undefined
        }
      />
    </div>
  )
}

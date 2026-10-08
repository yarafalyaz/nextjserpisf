export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PurchaseOrderForm } from "@/components/forms/purchase-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pesanan" }

export default async function CreatePurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ prId?: string }>
}) {
  await requirePermission("create_purchase_orders")
  const params = await searchParams
  const prId = params.prId ? Number(params.prId) : undefined

  const [vendors, items, approvedPRs, preselectedPR] = await Promise.all([
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
    // PR yang siap dipesan (belum dibuatkan PO): approved / partial_ordered.
    prisma.purchaseRequest.findMany({
      where: { status: { in: ["approved", "partial_ordered"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true, title: true, vendorId: true },
    }),
    prId
      ? prisma.purchaseRequest.findUnique({
          where: { id: prId },
          include: { items: true },
        })
      : Promise.resolve(null),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Pesanan",href:"/pembelian/pesanan"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Pesanan Pembelian</h1>
      </div>
      <PurchaseOrderForm
        vendors={vendors}
        items={JSON.parse(JSON.stringify(items))}
        defaultPrId={preselectedPR?.id}
        purchaseRequests={JSON.parse(JSON.stringify(approvedPRs))}
        preselectedPR={
          preselectedPR
            ? JSON.parse(
                JSON.stringify({
                  id: preselectedPR.id,
                  documentNo: preselectedPR.documentNo,
                  title: preselectedPR.title,
                  vendorId: preselectedPR.vendorId,
                  items: preselectedPR.items.map((it) => ({
                    itemId: it.itemId,
                    qty: Number(it.qty),
                    notes: it.notes,
                  })),
                }),
              )
            : null
        }
      />
    </div>
  )
}

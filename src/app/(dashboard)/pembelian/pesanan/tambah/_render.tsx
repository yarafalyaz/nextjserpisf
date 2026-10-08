import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PurchaseOrderForm } from "@/components/forms/purchase-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

/**
 * Shared server renderer for "Buat Pesanan Pembelian".
 *
 * Used by both routes:
 *   /pembelian/pesanan/tambah           → buy directly (no PR)
 *   /pembelian/pesanan/tambah/[prId]    → create a PO for a specific PR
 *
 * Keeping the query + form wiring here avoids the two routes drifting apart.
 */
export async function renderCreatePurchaseOrder(prId?: number) {
  const [vendors, items, approvedPRs, preselectedPR] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, paymentTerm: { select: { name: true, code: true, days: true } } },
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

  // A PR id was requested but does not exist → 404 rather than silently
  // falling back to an unlinked PO.
  if (prId && !preselectedPR) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pembelian", href: "/pembelian" },
          { label: "Pesanan", href: "/pembelian/pesanan" },
          { label: "Tambah" },
        ]}
      />
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

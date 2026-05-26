export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePurchaseOrder } from "@/actions/purchase.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_purchase_orders")
  const { id } = await params

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: Number(id) },
    include: {
      vendor: true,
      purchaseRequest: true,
      items: true,
      goodsReceipts: { include: { items: true } },
      purchaseReturns: true,
    },
  })

  if (!po) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Purchase",href:"/purchase"},{label:"Orders",href:"/purchase/orders"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">PO {po.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={po.status} />
  <div className="flex gap-2">
          <Link href={`/purchase/orders/${po.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <PrintButton />
          <DeleteButton id={po.id} action={deletePurchaseOrder} />
                  <Link href="/purchase/orders" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Purchase order detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <StatusActions
        status={po.status}
        id={po.id}
        module="purchase/orders"
      />
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Vendor</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{po.vendor.name}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(po.date)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Expected</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(po.expectedDate)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">PR Ref</span>
                      <span className="text-[0.9375rem] text-foreground font-medium font-mono">{po.purchaseRequest?.documentNo || "-"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Grand Total</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(po.grandTotal))}</span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {po.notes && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{po.notes}</span>
                    </div>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "items",
            label: "Items",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Items</h2>
                </div>
                <div className="p-4 px-5">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th>Item ID</th>
                        <th style={{ textAlign: "right" }}>Qty</th>
                        <th style={{ textAlign: "right" }}>Received</th>
                        <th style={{ textAlign: "right" }}>Harga</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.items.map((item) => (
                        <tr key={item.id}>
                          <td>Item #{item.itemId}</td>
                          <td className="text-right">{Number(item.qty)}</td>
                          <td className="text-right">{Number(item.receivedQty)}</td>
                          <td className="text-right">{formatCurrency(Number(item.unitPrice))}</td>
                          <td className="text-right">{formatCurrency(Number(item.total))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="text-right"><strong>Grand Total</strong></td>
                        <td className="text-right"><strong>{formatCurrency(Number(po.grandTotal))}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ),
          },
          {
            id: "penerimaan",
            label: "Penerimaan",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Goods Receipts</h2>
                  {po.status === "ordered" && (
                    <Link href={`/purchase/goods-receipts/create?poId=${po.id}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -primary">+ Buat GR</Link>
                  )}
                </div>
                <div className="p-4 px-5">
                  {po.goodsReceipts.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada goods receipt</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Tanggal</th><th>Items</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {po.goodsReceipts.map((gr) => (
                          <tr key={gr.id}>
                            <td className="font-mono"><Link href={`/purchase/goods-receipts/${gr.id}`}>{gr.documentNo}</Link></td>
                            <td>{formatDate(gr.date)}</td>
                            <td>{gr.items.length} item</td>
                            <td><StatusChip status={gr.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

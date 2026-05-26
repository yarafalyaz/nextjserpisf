export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePurchaseRequest } from "@/actions/purchase.actions"
import { StatusActions } from "@/components/ui/status-actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function PurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: Number(id) },
    include: {
      items: true,
      purchaseOrders: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!request) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Purchase",href:"/purchase"},{label:"Requests",href:"/purchase/requests"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Purchase Request {request.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`status-badge status-${request.status}`}>{request.status}</span>
  <div className="flex gap-2">
          <Link href={`/purchase/requests/${request.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <PrintButton />
          <DeleteButton id={request.id} action={deletePurchaseRequest} />
                  <Link href="/purchase/requests" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <StatusActions
        status={request.status}
        id={request.id}
        module="purchase/requests"
      />
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{request.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Judul</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{request.title || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(request.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(request.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item</h2>
        </div>
        <div className="p-4 px-5">
          {request.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {request.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.itemId}</td>
                    <td className="text-right">{Number(item.qty)}</td>
                    <td>{item.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Related POs */}
      {request.purchaseOrders.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Purchase Order Terkait</h2>
          </div>
          <div className="p-4 px-5">
            <table className="w-full border-collapse">
              <thead>
                <tr><th>No. Dokumen</th><th>Tanggal</th><th>Status</th></tr>
              </thead>
              <tbody>
                {request.purchaseOrders.map((po) => (
                  <tr key={po.id}>
                    <td className="font-mono"><Link href={`/purchase/orders/${po.id}`}>{po.documentNo}</Link></td>
                    <td>{formatDate(po.date)}</td>
                    <td><span className={`status-badge status-${po.status}`}>{po.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {request.notes && (
        <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{request.notes}</span>
          </div>
        </div>
      )}
    </div>
  )
}

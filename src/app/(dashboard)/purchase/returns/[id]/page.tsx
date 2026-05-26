export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePurchaseReturn } from "@/actions/purchase.actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const purchaseReturn = await prisma.purchaseReturn.findUnique({
    where: { id: Number(id) },
    include: {
      purchaseOrder: { include: { vendor: true } },
      items: true,
    },
  })

  if (!purchaseReturn) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Purchase", href: "/purchase" },
  { label: "Returns", href: "/purchase/returns" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Retur Pembelian {purchaseReturn.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className={`status-badge status-${purchaseReturn.status}`}>{purchaseReturn.status}</span>
  <div className="flex gap-2">
          <Link href={`/purchase/returns/${purchaseReturn.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <PrintButton />
          <DeleteButton id={purchaseReturn.id} action={deletePurchaseReturn} />
                  <Link href="/purchase/returns" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{purchaseReturn.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Purchase Order</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/purchase/orders/${purchaseReturn.purchaseOrder.id}`}>{purchaseReturn.purchaseOrder.documentNo}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Vendor</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <Link href={`/master/vendors/${purchaseReturn.purchaseOrder.vendor.id}`}>{purchaseReturn.purchaseOrder.vendor.name}</Link>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(purchaseReturn.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(purchaseReturn.createdAt)}</span>
          </div>
          <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Alasan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{purchaseReturn.reason || "-"}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item Retur</h2>
        </div>
        <div className="p-4 px-5">
          {purchaseReturn.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Biaya</th>
                </tr>
              </thead>
              <tbody>
                {purchaseReturn.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.itemId}</td>
                    <td className="text-right">{Number(item.qty)}</td>
                    <td className="text-right">{formatCurrency(Number(item.cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

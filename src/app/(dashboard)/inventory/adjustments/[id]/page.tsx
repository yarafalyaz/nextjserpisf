export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteStockAdjustment } from "@/actions/inventory.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function StockAdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const adjustment = await prisma.stockAdjustment.findUnique({
    where: { id: Number(id) },
    include: {
      warehouse: true,
      items: true,
    },
  })

  if (!adjustment) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dashboard",href:"/"},{label:"Inventory",href:"/inventory"},{label:"Adjustments",href:"/inventory/adjustments"},{label:"Detail"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Penyesuaian Stok {adjustment.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={adjustment.status} />
  <div className="flex gap-2">
          <Link href={`/inventory/adjustments/${adjustment.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={adjustment.id} action={deleteStockAdjustment} />
                  <Link href="/inventory/adjustments" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{adjustment.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Gudang</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{adjustment.warehouse.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(adjustment.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={adjustment.status} /></span>
          </div>
          {adjustment.reason && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Alasan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{adjustment.reason}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tipe</span>
            <span className="text-[0.9375rem] text-foreground font-medium capitalize">{adjustment.type}</span>
          </div>
          {adjustment.notes && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{adjustment.notes}</span>
            </div>
          )}
          {adjustment.approvedBy && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Disetujui Oleh</span>
              <span className="text-[0.9375rem] text-foreground font-medium">User #{adjustment.approvedBy}</span>
            </div>
          )}
          {adjustment.approvedAt && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Disetujui Pada</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(adjustment.approvedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Items</h2>
        </div>
        <div className="p-4 px-5">
          {adjustment.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th style={{ textAlign: "right" }}>Qty Sistem</th>
                  <th style={{ textAlign: "right" }}>Qty Aktual</th>
                  <th style={{ textAlign: "right" }}>Selisih</th>
                </tr>
              </thead>
              <tbody>
                {adjustment.items.map((item) => (
                  <tr key={item.id}>
                    <td>Item #{item.itemId}</td>
                    <td className="text-right">{Number(item.systemQty)}</td>
                    <td className="text-right">{Number(item.actualQty)}</td>
                    <td className="text-right">{Number(item.difference)}</td>
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

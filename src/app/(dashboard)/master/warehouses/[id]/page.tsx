export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: Number(id), deletedAt: null },
    include: {
      racks: { include: { rows: true } },
    },
  })

  if (!warehouse) notFound()

  const stockMoves = await prisma.stockMove.findMany({
    where: { warehouseId: Number(id), status: "posted" },
    include: { item: { include: { category: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Warehouses", href: "/master/warehouses" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{warehouse.name}</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href={`/master/warehouses/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <Link href="/master/warehouses" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Warehouse detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama Gudang</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{warehouse.name}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Kode</span>
                      <span className="text-[0.9375rem] text-foreground font-medium font-mono">{warehouse.code}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">
                        <span className={`status-badge status-${warehouse.isActive ? "active" : "inactive"}`}>
                          {warehouse.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(warehouse.createdAt)}</span>
                    </div>
                    <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Alamat</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{warehouse.address || "-"}</span>
                    </div>
                  </div>
                </div>

                {/* Racks */}
                <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                    <h2 className="text-[0.9375rem] font-semibold text-foreground">Rak</h2>
                  </div>
                  <div className="p-4 px-5">
                    {warehouse.racks.length === 0 ? (
                      <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada rak</p>
                    ) : (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr><th>Kode</th><th>Nama</th><th>Jumlah Baris</th></tr>
                        </thead>
                        <tbody>
                          {warehouse.racks.map((rack) => (
                            <tr key={rack.id}>
                              <td className="font-mono">{rack.code}</td>
                              <td>{rack.name}</td>
                              <td>{rack.rows.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            ),
          },
          {
            id: "items",
            label: `Stock Moves (${stockMoves.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Stok</h2>
                  <Link href={`/inventory/stock-moves?search=${warehouse.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {stockMoves.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada pergerakan stok</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Item</th><th>Impact</th><th style={{ textAlign: "right" }}>Qty</th><th>Tanggal</th></tr>
                      </thead>
                      <tbody>
                        {stockMoves.map((sm) => (
                          <tr key={sm.id}>
                            <td className="font-mono">{sm.documentNo}</td>
                            <td><Link href={`/master/items/${sm.itemId}`}>{sm.item.name}</Link></td>
                            <td><StatusChip status={sm.impact === "IN" ? "received" : "returned"} /></td>
                            <td className="text-right">{Number(sm.qty)}</td>
                            <td>{formatDate(sm.createdAt)}</td>
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

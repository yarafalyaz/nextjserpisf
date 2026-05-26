import { Eye, Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteItem } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_items")
  const { id } = await params

  const item = await prisma.item.findUnique({
    where: { id: Number(id) },
    include: {
      category: true,
      stockMoves: { take: 10, orderBy: { createdAt: "desc" }, include: { warehouse: true } },
      inventoryLayers: { where: { remaining: { gt: 0 } }, orderBy: { createdAt: "asc" } },
    },
  })

  if (!item) notFound()

  const isLowStock = Number(item.minStock) > 0 && Number(item.qtyOnHand) <= Number(item.minStock)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Items", href: "/master/items" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{item.name}</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href={`/master/items/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <DeleteButton id={item.id} action={deleteItem} />
          <Link href="/master/items" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Item detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">SKU</span>
                      <span className="text-[0.9375rem] text-foreground font-medium font-mono">{item.sku}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Kategori</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{item.category?.name || "-"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Satuan</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{item.unitOfMeasure}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Stok Saat Ini</span>
                      <span className={`detail-value ${isLowStock ? "text-danger" : ""}`}>
                        {Number(item.qtyOnHand)} {item.unitOfMeasure}
                        {isLowStock && " ⚠️"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Minimum Stok</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{Number(item.minStock)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Harga Beli</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(item.cost))}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Harga Jual</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(item.price))}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Nilai Stok</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(item.qtyOnHand) * Number(item.cost))}</span>
                    </div>
                  </div>
                </div>
                {item.description && (
                  <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Deskripsi</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{item.description}</span>
                    </div>
                  </div>
                )}
              </>
            ),
          },
          {
            id: "stok",
            label: "Stok",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">FIFO Layers (Sisa)</h2>
                </div>
                <div className="p-4 px-5">
                  {item.inventoryLayers.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada layer aktif</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>Masuk</th><th style={{ textAlign: "right" }}>Qty In</th><th style={{ textAlign: "right" }}>Qty Out</th><th style={{ textAlign: "right" }}>Sisa</th><th style={{ textAlign: "right" }}>Unit Cost</th></tr>
                      </thead>
                      <tbody>
                        {item.inventoryLayers.map((layer) => (
                          <tr key={layer.id}>
                            <td>{formatDate(layer.createdAt)}</td>
                            <td className="text-right">{Number(layer.qtyIn)}</td>
                            <td className="text-right">{Number(layer.qtyOut)}</td>
                            <td className="text-right"><strong>{Number(layer.remaining)}</strong></td>
                            <td className="text-right">{formatCurrency(Number(layer.unitCost))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "transaksi",
            label: "Transaksi",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Stock Moves Terbaru</h2>
                  <Link href={`/inventory/stock-moves?search=${item.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {item.stockMoves.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada stock move</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr><th>No. Dokumen</th><th>Gudang</th><th>Impact</th><th style={{ textAlign: "right" }}>Qty</th><th>Tanggal</th></tr>
                      </thead>
                      <tbody>
                        {item.stockMoves.map((sm) => (
                          <tr key={sm.id}>
                            <td className="font-mono">{sm.documentNo}</td>
                            <td>{sm.warehouse?.name || "-"}</td>
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

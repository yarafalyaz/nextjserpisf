import { Pencil } from "lucide-react"
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
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
      <PageHeader
        title={item.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Items", href: "/master/items" },
          { label: "Detail" },
        ]}
        badge={item.isProduct ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">Produk</span>
        ) : undefined}
        actions={
          <>
            <Button href={`/master/items/${id}/edit`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <DeleteButton id={item.id} action={deleteItem} />
            <BackButton href="/master/items" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Item detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <DetailCard>
                  <DetailField label="SKU" value={item.sku} mono />
                  <DetailField label="Kategori" value={item.category?.name || "-"} />
                  <DetailField label="Satuan" value={item.unitOfMeasure} />
                  <DetailField label="Stok Saat Ini" value={
                    <span className={isLowStock ? "text-danger" : ""}>
                      {Number(item.qtyOnHand)} {item.unitOfMeasure}
                      {isLowStock && " ⚠️"}
                    </span>
                  } />
                  <DetailField label="Minimum Stok" value={String(Number(item.minStock))} />
                  <DetailField label="Harga Beli" value={formatCurrency(Number(item.cost))} />
                  <DetailField label="Harga Jual" value={formatCurrency(Number(item.price))} />
                  <DetailField label="Nilai Stok" value={formatCurrency(Number(item.qtyOnHand) * Number(item.cost))} />
                </DetailCard>
                {item.description && (
                  <DetailCard>
                    <DetailField label="Deskripsi" value={item.description} colSpan="full" />
                  </DetailCard>
                )}
              </>
            ),
          },
          {
            id: "stok",
            label: "Stok",
            content: (
              <DetailSection title="FIFO Layers (Sisa)">
                {item.inventoryLayers.length === 0 ? (
                  <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada layer aktif</p>
                ) : (
                  <DetailTable>
                    <DetailTableHead>
                      <DetailTableTh>Masuk</DetailTableTh>
                      <DetailTableTh align="right">Qty In</DetailTableTh>
                      <DetailTableTh align="right">Qty Out</DetailTableTh>
                      <DetailTableTh align="right">Sisa</DetailTableTh>
                      <DetailTableTh align="right">Unit Cost</DetailTableTh>
                    </DetailTableHead>
                    <DetailTableBody>
                      {item.inventoryLayers.map((layer) => (
                        <DetailTableRow key={layer.id}>
                          <DetailTableTd>{formatDate(layer.createdAt)}</DetailTableTd>
                          <DetailTableTd align="right">{Number(layer.qtyIn)}</DetailTableTd>
                          <DetailTableTd align="right">{Number(layer.qtyOut)}</DetailTableTd>
                          <DetailTableTd align="right"><strong>{Number(layer.remaining)}</strong></DetailTableTd>
                          <DetailTableTd align="right">{formatCurrency(Number(layer.unitCost))}</DetailTableTd>
                        </DetailTableRow>
                      ))}
                    </DetailTableBody>
                  </DetailTable>
                )}
              </DetailSection>
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
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Gudang</DetailTableTh>
                        <DetailTableTh>Impact</DetailTableTh>
                        <DetailTableTh align="right">Qty</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {item.stockMoves.map((sm) => (
                          <DetailTableRow key={sm.id}>
                            <DetailTableTd className="font-mono">{sm.documentNo}</DetailTableTd>
                            <DetailTableTd>{sm.warehouse?.name || "-"}</DetailTableTd>
                            <DetailTableTd><StatusChip status={sm.impact === "IN" ? "received" : "returned"} /></DetailTableTd>
                            <DetailTableTd align="right">{Number(sm.qty)}</DetailTableTd>
                            <DetailTableTd>{formatDate(sm.createdAt)}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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

export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
      <PageHeader
        title={warehouse.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Warehouses", href: "/master/gudang" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/master/warehouses/${id}/edit`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <BackButton href="/master/gudang" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Warehouse detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <DetailCard>
                  <DetailField label="Nama Gudang" value={warehouse.name} />
                  <DetailField label="Kode" value={warehouse.code} mono />
                  <DetailField label="Status" value={
                    <span className={`status-badge status-${warehouse.isActive ? "active" : "inactive"}`}>
                      {warehouse.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  } />
                  <DetailField label="Dibuat" value={formatDate(warehouse.createdAt)} />
                  <DetailField label="Alamat" value={warehouse.address || "-"} colSpan="full" />
                </DetailCard>

                {/* Racks */}
                <DetailSection title="Rak">
                  {warehouse.racks.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada rak</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Kode</DetailTableTh>
                        <DetailTableTh>Nama</DetailTableTh>
                        <DetailTableTh>Jumlah Baris</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {warehouse.racks.map((rack) => (
                          <DetailTableRow key={rack.id}>
                            <DetailTableTd className="font-mono">{rack.code}</DetailTableTd>
                            <DetailTableTd>{rack.name}</DetailTableTd>
                            <DetailTableTd>{rack.rows.length}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </DetailSection>
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
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Item</DetailTableTh>
                        <DetailTableTh>Impact</DetailTableTh>
                        <DetailTableTh align="right">Qty</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {stockMoves.map((sm) => (
                          <DetailTableRow key={sm.id}>
                            <DetailTableTd className="font-mono">{sm.documentNo}</DetailTableTd>
                            <DetailTableTd><Link href={`/master/items/${sm.itemId}`}>{sm.item.name}</Link></DetailTableTd>
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

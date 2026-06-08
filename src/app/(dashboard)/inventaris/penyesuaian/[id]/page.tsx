export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteStockAdjustment } from "@/actions/inventory.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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
      <PageHeader
        title={`Penyesuaian Stok ${adjustment.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Penyesuaian", href: "/inventaris/penyesuaian" },
          { label: adjustment.documentNo },
        ]}
        badge={<StatusChip status={adjustment.status} />}
        actions={
          <>
            <Button href={`/inventaris/penyesuaian/${adjustment.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={adjustment.id} action={deleteStockAdjustment} />
            <BackButton href="/inventaris/penyesuaian" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={adjustment.documentNo} mono />
        <DetailField label="Gudang" value={adjustment.warehouse.name} />
        <DetailField label="Tanggal" value={formatDate(adjustment.date)} />
        <DetailField label="Status" value={<StatusChip status={adjustment.status} />} />
        <DetailField label="Tipe" value={<span className="capitalize">{adjustment.type}</span>} />
        {adjustment.reason && (
          <DetailField label="Alasan" value={adjustment.reason} colSpan="full" />
        )}
        {adjustment.notes && (
          <DetailField label="Catatan" value={adjustment.notes} colSpan="full" />
        )}
        {adjustment.approvedBy && (
          <DetailField label="Disetujui Oleh" value={`User #${adjustment.approvedBy}`} />
        )}
        {adjustment.approvedAt && (
          <DetailField label="Disetujui Pada" value={formatDate(adjustment.approvedAt)} />
        )}
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
        </div>
        <div className="p-4 px-5">
          {adjustment.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada item</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>ID Barang</DetailTableTh>
                <DetailTableTh align="right">Qty Sistem</DetailTableTh>
                <DetailTableTh align="right">Qty Aktual</DetailTableTh>
                <DetailTableTh align="right">Selisih</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {adjustment.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>Item #{item.itemId}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.systemQty)}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.actualQty)}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.difference)}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}

export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteInventoryTransfer } from "@/actions/inventory.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function InventoryTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const transfer = await prisma.inventoryTransfer.findUnique({
    where: { id: Number(id) },
    include: {
      sourceWarehouse: true,
      destinationWarehouse: true,
      items: true,
    },
  })

  if (!transfer) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Transfer Stok ${transfer.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Inventory", href: "/inventaris" },
          { label: "Transfer", href: "/inventaris/transfer" },
          { label: transfer.documentNo },
        ]}
        badge={<StatusChip status={transfer.status} />}
        actions={
          <>
            <Button href={`/inventaris/transfer/${transfer.id}/edit`} variant="primary">Edit</Button>
            <DeleteButton id={transfer.id} action={deleteInventoryTransfer} />
            <BackButton href="/inventaris/transfer" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={transfer.documentNo} mono />
        <DetailField label="Tanggal" value={formatDate(transfer.date)} />
        <DetailField label="Gudang Asal" value={transfer.sourceWarehouse.name} />
        <DetailField label="Gudang Tujuan" value={transfer.destinationWarehouse.name} />
        <DetailField label="Status" value={<StatusChip status={transfer.status} />} />
        {transfer.notes && (
          <DetailField label="Catatan" value={transfer.notes} colSpan="full" />
        )}
      </DetailCard>

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
        </div>
        <div className="p-4 px-5">
          {transfer.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Item ID</DetailTableTh>
                <DetailTableTh align="right">Qty</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {transfer.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>Item #{item.itemId}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
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

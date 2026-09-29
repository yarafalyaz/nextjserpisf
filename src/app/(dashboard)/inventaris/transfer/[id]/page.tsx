export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { ProcessButton } from "@/components/ui/process-button"
import { deleteInventoryTransfer, processInventoryTransfer, receiveInventoryTransfer } from "@/actions/inventory.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Transfer Stok" }

export default async function InventoryTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_inventory_transfers")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const transfer = await prisma.inventoryTransfer.findUnique({
    where: { id: numId },
    include: {
      sourceWarehouse: true,
      destinationWarehouse: true,
      items: true,
    },
  })

  if (!transfer) notFound()

  // Fetch item names dynamically
  const itemIds = transfer.items.map((i) => i.itemId)
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true },
  })
  const itemNameMap = new Map(items.map((i) => [i.id, i.name]))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Transfer Stok ${transfer.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Transfer", href: "/inventaris/transfer" },
          { label: transfer.documentNo },
        ]}
        badge={<StatusChip status={transfer.status} />}
        actions={
          <>
            {transfer.status === "draft" && (
              <>
                <ProcessButton
                  id={transfer.id}
                  action={processInventoryTransfer}
                  successMessage="Transfer stok berhasil dikirim"
                  label="Kirim"
                />
                <Button href={`/inventaris/transfer/${transfer.id}/ubah`} variant="secondary">Ubah</Button>
                <DeleteButton id={transfer.id} action={deleteInventoryTransfer} />
              </>
            )}
            {transfer.status === "processed" && (
              <ProcessButton
                id={transfer.id}
                action={receiveInventoryTransfer}
                confirmTitle="Terima transfer barang ini?"
                confirmBody="Menerima transfer barang akan memperbarui stok di gudang tujuan."
                successMessage="Transfer stok berhasil diterima"
                label="Terima"
              />
            )}
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
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada item</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Barang</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {transfer.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{itemNameMap.get(item.itemId) || `Item #${item.itemId}`}</DetailTableTd>
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

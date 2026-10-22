export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { ProcessButton } from "@/components/ui/process-button"
import { closeInventoryTransferShortage, deleteInventoryTransfer, processInventoryTransfer, receiveInventoryTransfer } from "@/actions/inventory.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { canViewWarehouseScopedDocument } from "@/lib/auth/document-scope"
import { entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Transfer Stok" }

export default async function InventoryTransferDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_inventory_transfers")

  const { slug } = await params

  const transfer = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.inventoryTransfer.findFirst({
          where: { slug: s },
          include: {
            sourceWarehouse: true,
            destinationWarehouse: true,
            items: true,
          },
        }),
      byId: (id) =>
        prisma.inventoryTransfer.findUnique({
          where: { id },
          include: {
            sourceWarehouse: true,
            destinationWarehouse: true,
            items: true,
          },
        }),
    },
  )

  if (!transfer) notFound()

  // Batas gudang: penjagaan yang SAMA dengan lampiran & cetak
  // (lib/auth/document-scope) — transfer menyentuh dua gudang, keduanya dicek.
  if (!(await canViewWarehouseScopedDocument("inventory_transfer", transfer.id))) notFound()

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
                <CanCreate permission="edit_inventory_transfers">
                  <Button href={entityEditHref("/inventaris/transfer", transfer)} variant="secondary">Ubah</Button>
                </CanCreate>
                <CanCreate permission="delete_inventory_transfers">
                  <DeleteButton id={transfer.id} action={deleteInventoryTransfer} />
                </CanCreate>
              </>
            )}
            {(transfer.status === "processed" || transfer.status === "partially_received") && (
              <>
                <ProcessButton
                  id={transfer.id}
                  action={receiveInventoryTransfer}
                  confirmTitle="Terima transfer barang ini?"
                  confirmBody="Menerima transfer barang akan memperbarui stok di gudang tujuan. Sisa yang belum diterima tetap berstatus diterima sebagian dan tampil di Laporan Stok Dalam Perjalanan."
                  successMessage="Transfer stok berhasil diterima"
                  label="Terima"
                />
                <CanCreate permission="create_stock_adjustments">
                  <ProcessButton
                    id={transfer.id}
                    action={closeInventoryTransferShortage}
                    confirmTitle="Tutup selisih transfer ini?"
                    confirmBody="Membuat draf penyesuaian selisih transfer di gudang tujuan. Transfer baru tertutup setelah draf itu diproses dan disetujui. Setelah ditutup, sisa tidak lagi bisa diterima."
                    successMessage="Draf penutupan selisih berhasil dibuat"
                    label="Tutup Selisih"
                  />
                </CanCreate>
              </>
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
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
        </div>
        <div className="p-4 px-5">
          {transfer.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada barang</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Barang</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
                <DetailTableTh align="right">Diterima</DetailTableTh>
                <DetailTableTh align="right">Sisa</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {transfer.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd>{itemNameMap.get(item.itemId) || `Item #${item.itemId}`}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                    <DetailTableTd align="right">{Number(item.receivedQty)}</DetailTableTd>
                    <DetailTableTd align="right">{Math.max(0, Number(item.qty) - Number(item.receivedQty))}</DetailTableTd>
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

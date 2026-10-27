export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { ProcessButton } from "@/components/ui/process-button"
import { deleteInventoryTransfer, processInventoryTransfer } from "@/actions/inventory.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import {
  groupReceivedSerialsByLine,
  parseStoredSerials,
  remainingQty,
  remainingSerials,
  type TransferLineState,
} from "@/lib/services/inventory-transfer-receipt.service"
import { TransferReceivePanel, type TransferReceiveLine } from "./_components/transfer-receive-panel"

import type { Metadata } from "next"

import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { canViewWarehouseScopedDocument } from "@/lib/auth/document-scope"
import { entityEditHref, entityHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"
export const metadata: Metadata = { title: "Transfer Stok" }

/**
 * Kata tampil transfer F-2026-10-22-081-S §6: `processed` yang belum
 * diterima sama sekali tampil "Dalam Perjalanan" (bukan "Diproses" generik).
 * Label lain tetap dari STATUS_LABELS lewat StatusChip, satu sumber.
 */
export function transferStatusLabel(status: string): string | undefined {
  return status === "processed" ? "Dalam Perjalanan" : undefined
}

function parseStoredBatches(value: unknown): { batchNumber: string; qty: number }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (entry === null || Array.isArray(entry) || typeof entry !== "object") return []
    const allocation = entry as { batchNumber?: unknown; qty?: unknown }
    const qty = Number(allocation.qty)
    if (typeof allocation.batchNumber !== "string" || !Number.isFinite(qty) || qty <= 0) return []
    return [{ batchNumber: allocation.batchNumber, qty }]
  })
}

const transferInclude = {
  sourceWarehouse: true,
  destinationWarehouse: true,
  items: true,
  receipts: {
    orderBy: { receivedDate: "asc" as const },
    include: { items: true },
  },
  shortageAdjustments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    select: { id: true, documentNo: true, slug: true, status: true, reason: true },
  },
}

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
          include: transferInclude,
        }),
      byId: (id) =>
        prisma.inventoryTransfer.findUnique({
          where: { id },
          include: transferInclude,
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
    select: { id: true, name: true, unitOfMeasure: true, trackBatch: true },
  })
  const itemById = new Map(items.map((i) => [i.id, i]))
  const itemNameMap = new Map(items.map((i) => [i.id, i.name]))

  // Sisa per baris dihitung SERVER (service murni BOT 3): UI menampilkan
  // remainingQty/remainingSerials apa adanya, nol hitung ulang.
  const receivedSerialsByLine = groupReceivedSerialsByLine(
    transfer.receipts.flatMap((r) => r.items),
  )
  const lineStates: TransferLineState[] = transfer.items.map((it) => ({
    id: it.id,
    itemId: it.itemId,
    qty: Number(it.qty),
    receivedQty: Number(it.receivedQty),
    serialNumbers: parseStoredSerials(it.serialNumbers),
  }))
  const receiveLines: TransferReceiveLine[] = lineStates.map((line) => {
    const item = transfer.items.find((it) => it.id === line.id)
    const meta = itemById.get(line.itemId)
    return {
      transferItemId: line.id,
      itemName: itemNameMap.get(line.itemId) || `Item #${line.itemId}`,
      unit: meta?.unitOfMeasure ?? "",
      qty: line.qty,
      receivedQty: line.receivedQty,
      remainingQty: remainingQty(line),
      remainingSerials: remainingSerials(line, receivedSerialsByLine.get(line.id) ?? []),
      batchAllocations: meta?.trackBatch ? parseStoredBatches(item?.batchAllocations) : [],
    }
  })

  const isReceivable = transfer.status === "processed" || transfer.status === "partially_received"
  const canEditTransfer = isReceivable && (await hasPermission("edit_inventory_transfers"))
  const canCloseShortage = await hasPermission("create_stock_adjustments")
  const receiptEvents = transfer.receipts
  const activeShortage = transfer.shortageAdjustments.find((a) =>
    ["draft", "processing", "processed"].includes(a.status),
  )

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
        badge={<StatusChip status={transfer.status} customLabel={transferStatusLabel(transfer.status)} />}
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
            <BackButton href="/inventaris/transfer" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={transfer.documentNo} mono />
        <DetailField label="Tanggal" value={formatDate(transfer.date)} />
        <DetailField label="Gudang Asal" value={transfer.sourceWarehouse.name} />
        <DetailField label="Gudang Tujuan" value={transfer.destinationWarehouse.name} />
        <DetailField label="Status" value={<StatusChip status={transfer.status} customLabel={transferStatusLabel(transfer.status)} />} />
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
            <EmptyState title="Tidak ada barang" />
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Nama Barang</DetailTableTh>
                <DetailTableTh align="right">Terkirim</DetailTableTh>
                <DetailTableTh align="right">Sudah Diterima</DetailTableTh>
                <DetailTableTh align="right">Belum Diterima</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {receiveLines.map((line) => (
                  <DetailTableRow key={line.transferItemId}>
                    <DetailTableTd>{line.itemName}</DetailTableTd>
                    <DetailTableTd align="right">{formatNumber(line.qty)} {line.unit}</DetailTableTd>
                    <DetailTableTd align="right">{formatNumber(line.receivedQty)}</DetailTableTd>
                    <DetailTableTd align="right">{formatNumber(line.remainingQty)}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>

      {isReceivable && canEditTransfer && (
        <TransferReceivePanel
          transferId={transfer.id}
          status={transfer.status}
          lines={receiveLines.filter((line) => line.remainingQty > 0)}
          canCloseShortage={canCloseShortage}
        />
      )}

      {isReceivable && !canEditTransfer && (
        <p className="text-sm text-muted-foreground">
          Anda tidak memiliki izin menerima transfer ini. Minta akses edit transfer inventaris ke admin.
        </p>
      )}

      {activeShortage && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Penutupan Selisih</h2>
          </div>
          <div className="flex flex-col gap-2 p-4 px-5 text-sm">
            <p>
              Draf Penyesuaian Stok <span className="font-mono">{activeShortage.documentNo}</span> — alasan: {activeShortage.reason}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
              Status draf: <StatusChip status={activeShortage.status} /> — transfer tertutup sesudah draf ini disetujui dan diproses.
            </p>
            <Button href={entityHref("/inventaris/penyesuaian", activeShortage)} variant="secondary" className="w-fit">
              Buka Penyesuaian Stok
            </Button>
          </div>
        </div>
      )}

      {receiptEvents.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Penerimaan</h2>
          </div>
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Tanggal Terima</DetailTableTh>
                <DetailTableTh>Barang</DetailTableTh>
                <DetailTableTh align="right">Qty Diterima</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {receiptEvents.flatMap((receipt) =>
                  receipt.items.map((entry) => {
                    const line = receiveLines.find((l) => l.transferItemId === entry.inventoryTransferItemId)
                    return (
                      <DetailTableRow key={entry.id}>
                        <DetailTableTd>{formatDate(receipt.receivedDate)}</DetailTableTd>
                        <DetailTableTd>{line?.itemName ?? `Baris #${entry.inventoryTransferItemId}`}</DetailTableTd>
                        <DetailTableTd align="right">{formatNumber(Number(entry.qty))}</DetailTableTd>
                      </DetailTableRow>
                    )
                  }),
                )}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      )}
    </div>
  )
}

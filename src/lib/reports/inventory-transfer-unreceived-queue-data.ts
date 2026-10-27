/**
 * Loader baca-saja antrean transfer inventaris belum diterima
 * penuh (F-2026-10-27-106-S, 106-B+F).
 *
 * Fail-closed SEBELUM query (BR-ITQ-06, Q-ITQ-3): izin
 * `view_inventory_transfers` — key yang sama dengan daftar
 * transfer existing, tanpa key baru — lalu saringan
 * `getWarehouseScope` pada `destinationWarehouseId`: `all`
 * semua tujuan, `assigned` hanya tujuan tertugaskan, `none`
 * nol baris tanpa query. Daftar existing dan laporan
 * in-transit TIDAK diubah loader ini.
 *
 * Select daftar-putih: TIDAK membaca `updatedAt` (dilarang jadi
 * acuan umur, BR-ITQ-02), `createdBy`/`receivedBy` (BR-ITQ-11),
 * atau kolom nilai/biaya apa pun (BR-ITQ-08).
 *
 * Anti-N+1 (AC-ITQ-B4): satu query transfer + SATU query massal
 * item + SATU query massal receipt untuk semua transfer —
 * bukan query per transfer.
 *
 * Baca-saja mutlak (BR-ITQ-07): hanya `findMany`; tidak
 * memanggil aksi tulis transfer existing dan tidak menulis
 * status/qty terima/pergerakan stok/lapisan/serial. Populasi/ember/umur/
 * tingkat/sisa/rekap di builder murni
 * `inventory-transfer-unreceived-queue.ts`.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import {
  buildInventoryTransferUnreceivedQueue,
  KNOWN_NON_TRANSIT_TRANSFER_STATUSES,
  type InventoryTransferUnreceivedInput,
  type InventoryTransferUnreceivedLineInput,
  type InventoryTransferUnreceivedQueue,
} from "@/lib/reports/inventory-transfer-unreceived-queue"

export interface InventoryTransferUnreceivedQueueOptions {
  now?: Date
  limit?: number
}

export async function getInventoryTransferUnreceivedQueue(
  options: InventoryTransferUnreceivedQueueOptions = {},
): Promise<InventoryTransferUnreceivedQueue> {
  const user = await requirePermission("view_inventory_transfers")
  const scope = await getWarehouseScope(user)
  const now = options.now ?? new Date()

  if (scope.kind === "none") return buildInventoryTransferUnreceivedQueue([], now)

  const scopedWhere =
    scope.kind === "all"
      ? {}
      : { destinationWarehouseId: { in: scope.warehouseIds } }

  const transfers = await prisma.inventoryTransfer.findMany({
    // Saring status terminal dikenal di DB; status asing tetap tertangkap untuk ember Status Tidak Dikenal.
    where: { ...scopedWhere, status: { notIn: [...KNOWN_NON_TRANSIT_TRANSFER_STATUSES] } },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      date: true,
      sourceWarehouseId: true,
      destinationWarehouseId: true,
      sourceWarehouse: { select: { name: true } },
      destinationWarehouse: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const ids = transfers.map((t) => t.id)

  const items =
    ids.length > 0
      ? await prisma.inventoryTransferItem.findMany({
          where: { inventoryTransferId: { in: ids } },
          select: {
            id: true,
            inventoryTransferId: true,
            itemId: true,
            qty: true,
            receivedQty: true,
          },
        })
      : []

  const receipts =
    ids.length > 0
      ? await prisma.inventoryTransferReceipt.findMany({
          where: { inventoryTransferId: { in: ids } },
          select: { inventoryTransferId: true, receivedDate: true },
        })
      : []

  const linesByTransfer = new Map<number, InventoryTransferUnreceivedLineInput[]>()
  for (const item of items) {
    const arr = linesByTransfer.get(item.inventoryTransferId) ?? []
    arr.push({
      lineId: item.id,
      itemId: item.itemId,
      qty: Number(item.qty),
      receivedQty: Number(item.receivedQty),
    })
    linesByTransfer.set(item.inventoryTransferId, arr)
  }

  const lastReceiptByTransfer = new Map<number, Date>()
  for (const receipt of receipts) {
    const previous = lastReceiptByTransfer.get(receipt.inventoryTransferId)
    if (previous == null || receipt.receivedDate.getTime() > previous.getTime()) {
      lastReceiptByTransfer.set(receipt.inventoryTransferId, receipt.receivedDate)
    }
  }

  const inputs: InventoryTransferUnreceivedInput[] = transfers.map((t) => ({
    transferId: t.id,
    slug: t.slug,
    documentNo: t.documentNo,
    status: t.status,
    date: t.date,
    sourceWarehouseId: t.sourceWarehouseId,
    sourceWarehouseName: t.sourceWarehouse?.name ?? null,
    destinationWarehouseId: t.destinationWarehouseId,
    destinationWarehouseName: t.destinationWarehouse?.name ?? null,
    lines: linesByTransfer.get(t.id) ?? [],
    lastReceiptAt: lastReceiptByTransfer.get(t.id) ?? null,
  }))

  return buildInventoryTransferUnreceivedQueue(inputs, now, undefined, options.limit)
}

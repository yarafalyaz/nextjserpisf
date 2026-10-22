/**
 * Service Permintaan Barang Antar Gudang — F-2026-10-22-078-S inti
 * (induk F-2026-10-21-014), spec BOT 5 §2/§3/§5 + putusan BOT 1
 * Q-MR-1/2/3 (backlog §8A). Keputusan fisik BOT 3:
 * - Q-MR-4: tautan banyak-transfer = kolom `materialRequestId` nullable
 *   di InventoryTransfer (BR-MR-03). Idempotensi buat-transfer dobel:
 *   klaim atomik status penjaga di dalam tx yang sama dengan create
 *   transfer + lock baris permintaan (FOR UPDATE) — dua panggilan
 *   konkuren terserialisasi; transfer kedua yang sah (pemenuhan
 *   bertahap) dibuat eksplisit lewat panggilan berikutnya.
 * - Q-MR-5: tautan WO hanya penanda (BR-MR-06). WO berstatus
 *   completed/cancelled TIDAK boleh ditautkan ke permintaan baru
 *   (kebutuhan job selesai tidak melahirkan permintaan baru); WO
 *   terhapus -> SetNull, permintaan tetap ada (AC-MR-9). Prefix nomor
 *   dokumen = "MRQ" (usulan spec §1, pola generateDocumentNumber).
 *
 * Permintaan TIDAK PERNAH menulis StockMove/jurnal/MaterialIssue
 * (BR-MR-02/BR-MR-12, AC-MR-8): service ini hanya menulis
 * material_requests/material_request_items + satu kolom tautan di
 * inventory_transfers saat transfer lahir.
 */

import { prisma, type TxClient } from "@/lib/db/prisma"
import {
  deriveMaterialRequestFulfillment,
  isMaterialRequestFulfillable,
} from "@/lib/reports/material-request"

type Tx = TxClient

export const MATERIAL_REQUEST_DOCUMENT_PREFIX = "MRQ"

/** Status WO yang menolak tautan permintaan baru (Q-MR-5). */
export const MATERIAL_REQUEST_WO_BLOCKED_STATUSES = ["completed", "cancelled"] as const

export interface MaterialRequestItemWrite {
  itemId: number
  qty: number
  notes?: string | null
}

export function validateMaterialRequestWarehouses(
  requesterWarehouseId: number,
  sourceWarehouseId: number,
): void {
  if (
    !Number.isSafeInteger(requesterWarehouseId) || requesterWarehouseId <= 0 ||
    !Number.isSafeInteger(sourceWarehouseId) || sourceWarehouseId <= 0
  ) {
    throw new Error("Gudang tujuan dan gudang sumber wajib dipilih")
  }
  // BR-MR-07: sumber != tujuan.
  if (requesterWarehouseId === sourceWarehouseId) {
    throw new Error("Gudang sumber dan gudang tujuan tidak boleh sama")
  }
}

export function validateMaterialRequestItems(
  items: readonly MaterialRequestItemWrite[],
): MaterialRequestItemWrite[] {
  if (items.length === 0) {
    throw new Error("Permintaan wajib memiliki minimal satu baris item")
  }
  const seen = new Set<number>()
  for (const item of items) {
    if (!Number.isSafeInteger(item.itemId) || item.itemId <= 0) {
      throw new Error("Item tidak valid")
    }
    if (!Number.isFinite(item.qty) || item.qty <= 0) {
      throw new Error("Kuantitas tidak valid")
    }
    if (seen.has(item.itemId)) {
      throw new Error(`Item #${item.itemId} hanya boleh dicantumkan satu kali dalam permintaan.`)
    }
    seen.add(item.itemId)
  }
  return [...items]
}

export function requireReason(reason: string | null | undefined, actionLabel: string): string {
  const clean = typeof reason === "string" ? reason.trim() : ""
  if (!clean) throw new Error(`Alasan ${actionLabel} wajib diisi`)
  return clean
}

/** Klaim atomik pola repo: updateMany status-penjaga; 0 = kalah balapan/status salah. */
export async function claimMaterialRequestTransition(
  tx: Tx,
  id: number,
  fromStatuses: readonly string[],
  data: Record<string, unknown>,
): Promise<boolean> {
  const claim = await tx.materialRequest.updateMany({
    where: { id, status: { in: [...fromStatuses] } },
    data,
  })
  return claim.count > 0
}

export async function lockMaterialRequestRow(tx: Tx, id: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM material_requests WHERE id = ${id} FOR UPDATE`
}

/**
 * Turunan pemenuhan sesudah satu transfer tertaut diterima (BR-MR-04).
 * Dipanggil receiveInventoryTransfer di tx yang sama: hitung ulang dari
 * SEMUA transfer received tertaut (bukan hanya transfer ini) supaya
 * penerimaan bertahap antar-transfer benar. Status terminal
 * (ditutup_manual/dibatalkan/ditolak/terpenuhi) tidak ditimpa.
 */
export async function refreshMaterialRequestFulfillmentTx(
  tx: Tx,
  materialRequestId: number,
): Promise<string | null> {
  const request = await tx.materialRequest.findUnique({
    where: { id: materialRequestId },
    select: {
      status: true,
      items: { select: { itemId: true, qty: true } },
    },
  })
  if (!request || !isMaterialRequestFulfillable(request.status)) return request?.status ?? null

  const receivedTransfers = await tx.inventoryTransfer.findMany({
    where: { materialRequestId, status: "received" },
    select: { items: { select: { itemId: true, qty: true } } },
  })

  const { status } = deriveMaterialRequestFulfillment({
    requested: request.items.map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })),
    receivedLines: receivedTransfers.flatMap((t) =>
      t.items.map((i) => ({ itemId: i.itemId, qty: Number(i.qty) })),
    ),
  })

  if (status !== request.status) {
    // Klaim penjaga: hanya dari status yang baru dibaca; balapan dengan
    // tutup manual -> yang menang duluan berlaku, turunan tidak menimpa.
    await tx.materialRequest.updateMany({
      where: { id: materialRequestId, status: request.status },
      data: { status },
    })
  }
  return status
}

/** Gudang aktif? Aksi atas gudang nonaktif ditolak beralasan (edge spec §7). */
export async function assertWarehousesExistAndActive(
  tx: Tx,
  warehouseIds: readonly number[],
): Promise<void> {
  const warehouses = await tx.warehouse.findMany({
    where: { id: { in: [...warehouseIds] }, deletedAt: null },
    select: { id: true, name: true, isActive: true },
  })
  for (const id of warehouseIds) {
    const warehouse = warehouses.find((w) => w.id === id)
    if (!warehouse) throw new Error(`Gudang #${id} tidak ditemukan`)
    if (!warehouse.isActive) {
      throw new Error(`Gudang ${warehouse.name} tidak aktif; permintaan tidak dapat diproses`)
    }
  }
}

export async function assertItemsExistAndActive(
  tx: Tx,
  itemIds: readonly number[],
): Promise<void> {
  const items = await tx.item.findMany({
    where: { id: { in: [...itemIds] }, deletedAt: null },
    select: { id: true, name: true, isActive: true },
  })
  for (const id of itemIds) {
    const item = items.find((i) => i.id === id)
    if (!item) throw new Error(`Item #${id} tidak ditemukan`)
    if (!item.isActive) throw new Error(`Item ${item.name} tidak aktif; tidak dapat diminta`)
  }
}

/** Q-MR-5: WO tertaut hanya penanda; WO selesai/batal menolak tautan baru. */
export async function assertWorkOrderLinkable(tx: Tx, workOrderId: number): Promise<void> {
  const workOrder = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: { status: true, documentNo: true },
  })
  if (!workOrder) throw new Error("Perintah Kerja tidak ditemukan")
  if ((MATERIAL_REQUEST_WO_BLOCKED_STATUSES as readonly string[]).includes(workOrder.status)) {
    throw new Error(
      `Perintah Kerja ${workOrder.documentNo} berstatus '${workOrder.status}'; permintaan baru tidak dapat ditautkan`,
    )
  }
}

export { prisma }

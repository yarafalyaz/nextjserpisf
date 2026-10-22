/**
 * Penerimaan transfer parsial per KEJADIAN — F-2026-10-22-081-S inti
 * (induk F-2026-10-21-015), spec BOT 5 §2/§3/§5 + putusan BOT 1 §9A
 * (Q-TP-5 inti dibuka, Q-TP-1 tanggal kejadian sendiri, Q-TP-4 penutup
 * selisih = create_stock_adjustments konteks tujuan + approval orang
 * berbeda) + keputusan fisik BOT 3 (Q-TP-2/Q-TP-3, kartu t_2f8b04f3):
 *
 * - Q-TP-2: kejadian terima = baris InventoryTransferReceipt +
 *   InventoryTransferReceiptItem; idempotencyKey unik per submit
 *   (BR-TP-06). receivedQty kumulatif PER BARIS dokumen (pola
 *   PurchaseOrderItem) — baris duplikat item yang sama TIDAK digabung
 *   untuk receivedQty walau StockMove IN diagregasi per item.
 * - Q-TP-3: penutupan selisih = StockAdjustment alasan persis
 *   "selisih transfer" tertaut (inventoryTransferId) di gudang TUJUAN,
 *   diproses sebagai JURNAL SAJA: sisa sudah OUT dari sumber dan tidak
 *   pernah masuk tujuan, jadi tidak ada stok fisik yang dipotong di
 *   gudang mana pun; jurnal existing Dr Penyesuaian / Cr Persediaan =
 *   sisa x carried cost OUT adalah satu-satunya jurnal (BR-TP-05).
 * - Terima selalu pada carried cost StockMove OUT, NOL jurnal
 *   (BR-TP-01, vonis BOT 4 t_0e45367a/PR #410 mengikat).
 *
 * Fungsi di file ini MURNI (tanpa Prisma): validasi baris kejadian,
 * turunan status, dan sisa penutupan. Penulis DB = hook transfer +
 * aksi inventory.
 */

import { safeAdd, safeMultiply, safeSubtract } from "@/lib/utils/math"

export const TRANSFER_PARTIALLY_RECEIVED_STATUS = "partially_received"
export const TRANSFER_SHORTAGE_REASON = "selisih transfer"

const EPSILON = 0.0001

export interface TransferLineState {
  id: number
  itemId: number
  qty: number
  receivedQty: number
  /** Serial terkirim beku dari process (atribusi FIFO sumber). */
  serialNumbers?: readonly string[] | null
}

export interface ReceiptLineInput {
  transferItemId: number
  qty: number
  serialNumbers?: readonly string[] | null
  batchAllocations?: readonly { batchNumber: string; qty: number }[] | null
}

export function remainingQty(line: Pick<TransferLineState, "qty" | "receivedQty">): number {
  return Math.max(0, safeSubtract(line.qty, line.receivedQty, 2))
}

/** Status transfer sesudah kumulatif baris tertentu (BR-TP-03). */
export function deriveTransferStatusAfterReceipt(
  lines: readonly Pick<TransferLineState, "qty" | "receivedQty">[],
): "received" | "partially_received" {
  const allFull = lines.length > 0 && lines.every((l) => remainingQty(l) <= EPSILON)
  return allFull ? "received" : TRANSFER_PARTIALLY_RECEIVED_STATUS
}

/** Serial terkirim yang belum diterima dari riwayat kejadian sebelumnya. */
export function remainingSerials(
  line: TransferLineState,
  alreadyReceivedSerials: readonly string[],
): string[] {
  const received = new Set(alreadyReceivedSerials)
  return (line.serialNumbers ?? []).filter((s) => !received.has(s))
}

/**
 * Validasi SATU kejadian terima terhadap keadaan baris tersimpan.
 * Melempar Error Bahasa Indonesia; pemanggil (aksi/hook) wajib sudah
 * mengunci baris transfer (klaim atomik) sebelum memanggil ini.
 */
export function validateReceiptLines(
  lines: readonly TransferLineState[],
  inputs: readonly ReceiptLineInput[],
  alreadyReceivedSerialsByLine: ReadonlyMap<number, readonly string[]>,
): ReceiptLineInput[] {
  if (inputs.length === 0) {
    throw new Error("Penerimaan wajib memiliki minimal satu baris diterima.")
  }
  const lineById = new Map(lines.map((l) => [l.id, l]))
  const seen = new Set<number>()
  const normalized: ReceiptLineInput[] = []
  for (const input of inputs) {
    const line = lineById.get(input.transferItemId)
    if (!line) {
      throw new Error(`Baris transfer #${input.transferItemId} tidak ditemukan pada transfer ini.`)
    }
    if (seen.has(input.transferItemId)) {
      throw new Error(`Baris transfer #${input.transferItemId} dicantumkan dua kali dalam satu penerimaan.`)
    }
    seen.add(input.transferItemId)
    if (!Number.isFinite(input.qty) || input.qty <= 0) {
      throw new Error(`Qty diterima untuk baris #${input.transferItemId} harus lebih dari 0.`)
    }
    const remaining = remainingQty(line)
    if (input.qty - remaining > EPSILON) {
      throw new Error(
        `Qty diterima (${input.qty}) melebihi sisa belum diterima (${remaining}) untuk baris #${input.transferItemId}.`,
      )
    }
    const serials = [...(input.serialNumbers ?? [])].map((s) => String(s).trim()).filter(Boolean)
    if (serials.length > 0) {
      if (new Set(serials).size !== serials.length) {
        throw new Error(`Nomor seri duplikat dalam penerimaan baris #${input.transferItemId}.`)
      }
      const stillOut = new Set(remainingSerials(line, alreadyReceivedSerialsByLine.get(line.id) ?? []))
      for (const serial of serials) {
        if (!stillOut.has(serial)) {
          throw new Error(
            `Nomor seri ${serial} bukan serial terkirim yang masih belum diterima pada baris #${input.transferItemId}.`,
          )
        }
      }
      // Serial-tracked: satu qty = satu serial (pola hook existing revive
      // per serial). Item serial pada baris ini dikenali dari serialNumbers
      // terkirim yang terisi.
      if ((line.serialNumbers ?? []).length > 0 && serials.length !== input.qty) {
        throw new Error(
          `Item berseri pada baris #${input.transferItemId} memerlukan tepat ${input.qty} nomor seri terpilih.`,
        )
      }
    }
    const batches = (input.batchAllocations ?? []).map((b) => ({
      batchNumber: String(b.batchNumber ?? "").trim(),
      qty: Number(b.qty),
    }))
    for (const batch of batches) {
      if (!batch.batchNumber || !Number.isFinite(batch.qty) || batch.qty <= 0) {
        throw new Error(`Alokasi batch tidak valid pada baris #${input.transferItemId}.`)
      }
    }
    const batchTotal = batches.reduce((sum, b) => safeAdd(sum, b.qty, 2), 0)
    if (batchTotal - input.qty > EPSILON) {
      throw new Error(`Alokasi batch melebihi qty diterima pada baris #${input.transferItemId}.`)
    }
    normalized.push({
      transferItemId: input.transferItemId,
      qty: input.qty,
      ...(serials.length > 0 ? { serialNumbers: serials } : {}),
      ...(batches.length > 0 ? { batchAllocations: batches } : {}),
    })
  }
  return normalized
}

export interface ShortageLine {
  transferItemId: number
  itemId: number
  remainingQty: number
  /** Serial sisa yang wajib tertera di draf penutupan (BR-TP-08). */
  serialNumbers: string[]
  /** Nilai sisa pada carried cost OUT per item (BR-TP-05). */
  unitCost: number
  value: number
}

/** Baris penutupan selisih: hanya baris yang masih bersisa. */
export function buildShortageLines(
  lines: readonly TransferLineState[],
  alreadyReceivedSerialsByLine: ReadonlyMap<number, readonly string[]>,
  carriedCostByItem: ReadonlyMap<number, number>,
): ShortageLine[] {
  const shortage: ShortageLine[] = []
  for (const line of lines) {
    const remaining = remainingQty(line)
    if (remaining <= EPSILON) continue
    const unitCost = carriedCostByItem.get(line.itemId) ?? 0
    shortage.push({
      transferItemId: line.id,
      itemId: line.itemId,
      remainingQty: remaining,
      serialNumbers: remainingSerials(line, alreadyReceivedSerialsByLine.get(line.id) ?? []),
      unitCost,
      value: safeMultiply(remaining, unitCost, 2),
    })
  }
  return shortage
}

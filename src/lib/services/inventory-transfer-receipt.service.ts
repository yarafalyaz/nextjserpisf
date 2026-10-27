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
  /** Lot terkirim beku dari process (atribusi FIFO sumber). */
  batchAllocations?: readonly { batchNumber: string; qty: number }[] | null
  /** Penanda master Item; bila undefined diturunkan dari atribusi terkirim. */
  trackSerial?: boolean
  /** Penanda master Item; bila undefined diturunkan dari atribusi terkirim. */
  trackBatch?: boolean
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

/** Lot tersimpan (Json) -> alokasi bersih; nilai non-array = kosong. */
export function parseStoredBatches(
  value: unknown,
): { batchNumber: string; qty: number }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): { batchNumber: string; qty: number }[] => {
    if (entry === null || Array.isArray(entry) || typeof entry !== "object") return []
    const allocation = entry as { batchNumber?: unknown; qty?: unknown }
    const qty = Number(allocation.qty)
    if (typeof allocation.batchNumber !== "string" || !allocation.batchNumber.trim()) return []
    if (!Number.isFinite(qty) || qty <= 0) return []
    return [{ batchNumber: allocation.batchNumber.trim(), qty }]
  })
}

/** Grup alokasi batch yang sudah diterima (riwayat kejadian) per baris transfer. */
export function groupReceivedBatchesByLine(
  rows: readonly { inventoryTransferItemId: number; batchAllocations: unknown }[],
): Map<number, Map<string, number>> {
  const byLine = new Map<number, Map<string, number>>()
  for (const row of rows) {
    const batches = parseStoredBatches(row.batchAllocations)
    if (batches.length === 0) continue
    const byBatch = byLine.get(row.inventoryTransferItemId) ?? new Map<string, number>()
    for (const batch of batches) {
      byBatch.set(batch.batchNumber, safeAdd(byBatch.get(batch.batchNumber) ?? 0, batch.qty, 2))
    }
    byLine.set(row.inventoryTransferItemId, byBatch)
  }
  return byLine
}

/** Lot terkirim yang masih tersisa sesudah riwayat kejadian sebelumnya. */
export function remainingBatches(
  line: TransferLineState,
  alreadyReceived: ReadonlyMap<string, number>,
): { batchNumber: string; qty: number }[] {
  const shipped = new Map<string, number>()
  for (const batch of line.batchAllocations ?? []) {
    const name = String(batch.batchNumber ?? "").trim()
    if (!name) continue
    shipped.set(name, safeAdd(shipped.get(name) ?? 0, Number(batch.qty), 2))
  }
  const remaining: { batchNumber: string; qty: number }[] = []
  for (const [batchNumber, qty] of shipped) {
    const left = safeSubtract(qty, alreadyReceived.get(batchNumber) ?? 0, 2)
    if (left > EPSILON) remaining.push({ batchNumber, qty: left })
  }
  return remaining
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
  alreadyReceivedBatchesByLine: ReadonlyMap<number, ReadonlyMap<string, number>> = new Map(),
): ReceiptLineInput[] {
  if (inputs.length === 0) {
    throw new Error("Penerimaan wajib memiliki minimal satu baris diterima.")
  }
  const lineById = new Map(lines.map((l) => [l.id, l]))
  const seen = new Set<number>()
  const normalized: ReceiptLineInput[] = []

  // Pool per item: atribusi FIFO disimpan satu baris per item (lihat
  // onTransferProcessed), jadi baris duplikat item yang sama berbagi pool
  // serial/lot yang sama. Penanda master juga dinilai per item.
  const shippedSerialPoolByItem = new Map<number, string[]>()
  const shippedBatchPoolByItem = new Map<number, Map<string, number>>()
  const trackSerialByItem = new Map<number, boolean | undefined>()
  const trackBatchByItem = new Map<number, boolean | undefined>()
  const alreadySerialPoolByItem = new Map<number, Set<string>>()
  const alreadyBatchPoolByItem = new Map<number, Map<string, number>>()
  for (const l of lines) {
    const serialPool = shippedSerialPoolByItem.get(l.itemId) ?? []
    for (const serial of l.serialNumbers ?? []) {
      if (!serialPool.includes(serial)) serialPool.push(serial)
    }
    shippedSerialPoolByItem.set(l.itemId, serialPool)

    const batchPool = shippedBatchPoolByItem.get(l.itemId) ?? new Map<string, number>()
    for (const batch of l.batchAllocations ?? []) {
      const name = String(batch.batchNumber ?? "").trim()
      if (!name) continue
      batchPool.set(name, safeAdd(batchPool.get(name) ?? 0, Number(batch.qty), 2))
    }
    shippedBatchPoolByItem.set(l.itemId, batchPool)

    if (l.trackSerial === true || trackSerialByItem.get(l.itemId) === true) {
      trackSerialByItem.set(l.itemId, true)
    } else if (l.trackSerial !== undefined && trackSerialByItem.get(l.itemId) === undefined) {
      trackSerialByItem.set(l.itemId, l.trackSerial)
    }
    if (l.trackBatch === true || trackBatchByItem.get(l.itemId) === true) {
      trackBatchByItem.set(l.itemId, true)
    } else if (l.trackBatch !== undefined && trackBatchByItem.get(l.itemId) === undefined) {
      trackBatchByItem.set(l.itemId, l.trackBatch)
    }

    const alreadySerialPool = alreadySerialPoolByItem.get(l.itemId) ?? new Set<string>()
    for (const serial of alreadyReceivedSerialsByLine.get(l.id) ?? []) alreadySerialPool.add(serial)
    alreadySerialPoolByItem.set(l.itemId, alreadySerialPool)

    const alreadyBatchPool = alreadyBatchPoolByItem.get(l.itemId) ?? new Map<string, number>()
    for (const [name, qty] of alreadyReceivedBatchesByLine.get(l.id) ?? new Map<string, number>()) {
      alreadyBatchPool.set(name, safeAdd(alreadyBatchPool.get(name) ?? 0, qty, 2))
    }
    alreadyBatchPoolByItem.set(l.itemId, alreadyBatchPool)
  }
  const eventSerialsByItem = new Map<number, Set<string>>()
  const eventBatchQtyByItem = new Map<number, Map<string, number>>()

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
    const shippedSerialsForItem = shippedSerialPoolByItem.get(line.itemId) ?? []
    const effectiveShippedSerials =
      shippedSerialsForItem.length > 0 ? shippedSerialsForItem : [...(line.serialNumbers ?? [])]
    const itemTrackSerial = trackSerialByItem.get(line.itemId)
    const isSerialTracked =
      line.trackSerial !== undefined
        ? line.trackSerial
        : itemTrackSerial !== undefined
          ? itemTrackSerial
          : effectiveShippedSerials.length > 0
    const alreadySerialPool = alreadySerialPoolByItem.get(line.itemId) ?? new Set<string>()
    const stillOutSerials = new Set(effectiveShippedSerials.filter((s) => !alreadySerialPool.has(s)))
    const eventSerials = eventSerialsByItem.get(line.itemId) ?? new Set<string>()

    if (isSerialTracked) {
      if (serials.length === 0) {
        throw new Error(
          `Item berseri pada baris #${input.transferItemId} memerlukan tepat ${input.qty} nomor seri terpilih.`,
        )
      }
      if (new Set(serials).size !== serials.length) {
        throw new Error(`Nomor seri duplikat dalam penerimaan baris #${input.transferItemId}.`)
      }
      for (const serial of serials) {
        if (eventSerials.has(serial)) {
          throw new Error(`Nomor seri duplikat dalam penerimaan baris #${input.transferItemId}.`)
        }
        if (!stillOutSerials.has(serial)) {
          throw new Error(
            `Nomor seri ${serial} bukan serial terkirim yang masih belum diterima pada baris #${input.transferItemId}.`,
          )
        }
      }
      if (Math.abs(serials.length - input.qty) > EPSILON) {
        throw new Error(
          `Item berseri pada baris #${input.transferItemId} memerlukan tepat ${input.qty} nomor seri terpilih.`,
        )
      }
      for (const serial of serials) eventSerials.add(serial)
      eventSerialsByItem.set(line.itemId, eventSerials)
    } else if (serials.length > 0) {
      if (new Set(serials).size !== serials.length) {
        throw new Error(`Nomor seri duplikat dalam penerimaan baris #${input.transferItemId}.`)
      }
      for (const serial of serials) {
        if (eventSerials.has(serial)) {
          throw new Error(`Nomor seri duplikat dalam penerimaan baris #${input.transferItemId}.`)
        }
        if (!stillOutSerials.has(serial)) {
          throw new Error(
            `Nomor seri ${serial} bukan serial terkirim yang masih belum diterima pada baris #${input.transferItemId}.`,
          )
        }
      }
      if (effectiveShippedSerials.length > 0 && Math.abs(serials.length - input.qty) > EPSILON) {
        throw new Error(
          `Item berseri pada baris #${input.transferItemId} memerlukan tepat ${input.qty} nomor seri terpilih.`,
        )
      }
      for (const serial of serials) eventSerials.add(serial)
      eventSerialsByItem.set(line.itemId, eventSerials)
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
    const batchQtyByNumber = new Map<string, number>()
    for (const batch of batches) {
      batchQtyByNumber.set(batch.batchNumber, safeAdd(batchQtyByNumber.get(batch.batchNumber) ?? 0, batch.qty, 2))
    }
    const batchTotal = batches.reduce((sum, b) => safeAdd(sum, b.qty, 2), 0)
    const shippedBatchForItem = shippedBatchPoolByItem.get(line.itemId) ?? new Map<string, number>()
    const lineBatchMap = new Map<string, number>()
    for (const batch of line.batchAllocations ?? []) {
      const name = String(batch.batchNumber ?? "").trim()
      if (name) lineBatchMap.set(name, safeAdd(lineBatchMap.get(name) ?? 0, Number(batch.qty), 2))
    }
    const effectiveShippedBatches = shippedBatchForItem.size > 0 ? shippedBatchForItem : lineBatchMap
    const itemTrackBatch = trackBatchByItem.get(line.itemId)
    const isBatchTracked =
      line.trackBatch !== undefined
        ? line.trackBatch
        : itemTrackBatch !== undefined
          ? itemTrackBatch
          : effectiveShippedBatches.size > 0
    const alreadyBatchPool = alreadyBatchPoolByItem.get(line.itemId) ?? new Map<string, number>()
    const eventBatchQty = eventBatchQtyByItem.get(line.itemId) ?? new Map<string, number>()

    const assertBatchTotalExact = () => {
      if (Math.abs(batchTotal - input.qty) > EPSILON) {
        if (batchTotal - input.qty > EPSILON) {
          throw new Error(`Alokasi batch melebihi qty diterima pada baris #${input.transferItemId}.`)
        }
        throw new Error(
          `Alokasi batch pada baris #${input.transferItemId} hanya ${batchTotal} dari qty diterima (${input.qty}); alokasi batch wajib menjumlah tepat sama dengan qty diterima.`,
        )
      }
    }
    const assertBatchLotsShipped = () => {
      for (const [batchNumber, allocQty] of batchQtyByNumber) {
        if (!effectiveShippedBatches.has(batchNumber)) {
          throw new Error(`Lot ${batchNumber} bukan lot terkirim pada baris #${input.transferItemId}.`)
        }
        const shippedQty = effectiveShippedBatches.get(batchNumber) ?? 0
        const alreadyQty = alreadyBatchPool.get(batchNumber) ?? 0
        const eventQty = eventBatchQty.get(batchNumber) ?? 0
        const remainingForLot = safeSubtract(safeSubtract(shippedQty, alreadyQty, 2), eventQty, 2)
        if (allocQty - remainingForLot > EPSILON) {
          throw new Error(
            `Alokasi lot ${batchNumber} (${allocQty}) melebihi sisa lot terkirim (${remainingForLot}) pada baris #${input.transferItemId}.`,
          )
        }
      }
    }

    if (isBatchTracked) {
      if (batches.length === 0) {
        throw new Error(
          `Item batch pada baris #${input.transferItemId} memerlukan alokasi nomor batch sejumlah qty diterima.`,
        )
      }
      assertBatchTotalExact()
      assertBatchLotsShipped()
      for (const [name, qty] of batchQtyByNumber) {
        eventBatchQty.set(name, safeAdd(eventBatchQty.get(name) ?? 0, qty, 2))
      }
      eventBatchQtyByItem.set(line.itemId, eventBatchQty)
    } else if (batches.length > 0) {
      assertBatchTotalExact()
      if (effectiveShippedBatches.size > 0) assertBatchLotsShipped()
      for (const [name, qty] of batchQtyByNumber) {
        eventBatchQty.set(name, safeAdd(eventBatchQty.get(name) ?? 0, qty, 2))
      }
      eventBatchQtyByItem.set(line.itemId, eventBatchQty)
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

/** Serial tersimpan (Json) -> string[] bersih; nilai non-array = kosong. */
export function parseStoredSerials(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string" && s.length > 0)
    : []
}

/** Grup serial yang sudah diterima (riwayat kejadian) per baris transfer. */
export function groupReceivedSerialsByLine(
  rows: readonly { inventoryTransferItemId: number; serialNumbers: unknown }[],
): Map<number, string[]> {
  const byLine = new Map<number, string[]>()
  for (const row of rows) {
    const serials = parseStoredSerials(row.serialNumbers)
    if (serials.length > 0) {
      byLine.set(row.inventoryTransferItemId, [...(byLine.get(row.inventoryTransferItemId) ?? []), ...serials])
    }
  }
  return byLine
}

/** Carried cost per item dari StockMove OUT (move pertama per item menang). */
export function carriedCostMapFromOutMoves(
  moves: readonly { itemId: number; cost: unknown }[],
): Map<number, number> {
  const map = new Map<number, number>()
  for (const move of moves) {
    if (!map.has(move.itemId)) map.set(move.itemId, Number(move.cost))
  }
  return map
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

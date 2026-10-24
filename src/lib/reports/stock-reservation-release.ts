/**
 * Kata rilis reservasi + baris tabel detail WO (F-2026-10-22-057-S §1/§2,
 * spec BOT 5 PR #442). Murni, tanpa Prisma — loader memberi fakta baris
 * StockReservation, modul ini memutus kata. Aturan stok TIDAK diputus di
 * sini; rujuk BR-RES F-045-S.
 *
 * - Kata verbatim §1: {n} = jumlah BARIS yang berubah pada peristiwa itu
 *   (bukan qty). 0 baris → null (tanpa pemberitahuan, no-op jujur).
 * - Tabel §2 passthrough: UI/loader dilarang menghitung ulang status dari
 *   MI/lapisan; sisa = qtyReserved − qtyConsumed dari baris itu sendiri.
 *   Kasus parsial tetap label "Dilepas" — label karangan dilarang.
 * - Baris gudang-belum-ditentukan BUKAN rilis: label #437, tak terhitung
 *   {n} peristiwa mana pun.
 */
import {
  RESERVATION_LABEL_NO_WAREHOUSE,
  reservationStatusLabel,
} from "@/lib/reports/stock-reservation"

export type ReservationReleaseTransition =
  | "complete"
  | "close"
  | "cancel"
  | "revise"

/** Kata pemberitahuan operator §1; null bila tak ada baris terlepas. */
export function reservationReleaseNotice(
  transition: ReservationReleaseTransition,
  releasedCount: number,
): string | null {
  if (!Number.isFinite(releasedCount) || releasedCount <= 0) return null
  const n = Math.floor(releasedCount)
  switch (transition) {
    case "complete":
      return `Selesai — ${n} reservasi sisa dilepas`
    case "close":
      return `Ditutup — ${n} reservasi sisa dilepas`
    case "cancel":
      return `Dibatalkan — ${n} reservasi sisa dilepas karena pembatalan`
    case "revise":
      return `Revisi — ${n} reservasi baris terdampak dilepas`
  }
}

export interface WorkOrderReservationRowInput {
  id: number
  itemName: string
  warehouseName: string
  qtyReserved: number
  qtyConsumed: number
  status: string
  expiresAt: Date | null
  releasedAt: Date | null
  releasedByName: string | null
  releaseReason: string | null
}

export interface WorkOrderReservationRow extends WorkOrderReservationRowInput {
  /** Sisa terlepas/aktif = reserved − consumed (passthrough baris, §2). */
  remainingQty: number
  statusLabel: string
}

/** Satu baris tabel §2; label dari konstanta #437 verbatim. */
export function buildWorkOrderReservationRow(
  input: WorkOrderReservationRowInput,
): WorkOrderReservationRow {
  return {
    ...input,
    remainingQty: Math.max(0, input.qtyReserved - input.qtyConsumed),
    statusLabel: reservationStatusLabel(input.status) ?? input.status,
  }
}

export interface UnreservedNeedRow {
  itemName: string
  remainingQty: number
  statusLabel: string
}

/**
 * Baris kebutuhan tanpa reservasi karena gudang belum ditentukan (§2):
 * tampil kata #437, BUKAN "Dilepas", dan tak pernah masuk hitungan rilis.
 */
export function buildUnreservedNeedRow(input: {
  itemName: string
  remainingQty: number
}): UnreservedNeedRow {
  return { ...input, statusLabel: RESERVATION_LABEL_NO_WAREHOUSE }
}

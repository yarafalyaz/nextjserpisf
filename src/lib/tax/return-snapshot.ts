/**
 * Snapshot pajak retur — beku saat complete, bukan hitung ulang saat baca (F-004).
 *
 * Vonis FINAL accountant F-2026-10-21-004:
 * - DPP = qty × price beku item; PPN = DPP × taxAmount/(subtotal−discount)
 *   faktur asal, `safeRound` sen; faktur asal taxAmount=0 → PPN-retur 0.
 * - Sesudah snapshot, edit harga/qty/master TIDAK mengubah potongan masa lalu.
 * - Baris legacy tanpa snapshot: fallback hitung-ulang DIIZINKAN dengan
 *   label `legacy` di read-model, bukan diam-diam dianggap snapshot.
 * - Guard kumulatif: Σ snapshot semua retur completed atas satu faktur asal
 *   ≤ DPP/PPN faktur asal (per item maupun total) — lewat → tolak saat
 *   complete dalam tx (lock faktur asal), bukan dipotong diam-diam.
 * - Masa pengurang = masa TANGGAL NOTA RETUR; tanpa nota = tanggal retur.
 * - `PurchaseReturnItem.cost` DILARANG jadi DPP.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { safeAdd, safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"

export interface ReturnSourceDocument {
  /** DPP asal = subtotal − discount. */
  subtotal: number
  discount: number
  taxAmount: number
}

export interface ReturnSnapshot {
  returnDpp: number
  returnVat: number
  /** Tarif efektif faktur asal saat snapshot (Decimal 5,2). */
  sourceTaxRate: number
}

/**
 * Bekukan snapshot satu baris retur. `price` = harga beku baris (JANGAN
 * cost — cost = HPP, bukan DPP).
 */
export function snapshotReturnLine(input: {
  qty: number
  price: number
  source: ReturnSourceDocument | null
}): ReturnSnapshot {
  const dpp = safeRound(safeMultiply(input.qty, input.price), 2)
  if (!input.source || input.source.taxAmount <= 0) {
    return { returnDpp: dpp, returnVat: 0, sourceTaxRate: 0 }
  }
  const sourceDpp = safeSubtract(input.source.subtotal, input.source.discount, 2)
  if (sourceDpp <= 0) return { returnDpp: dpp, returnVat: 0, sourceTaxRate: 0 }
  const rate = input.source.taxAmount / sourceDpp
  return {
    returnDpp: dpp,
    returnVat: safeRound(dpp * rate, 2),
    sourceTaxRate: safeRound(rate * 100, 2),
  }
}

export interface CumulativeGuard {
  allowed: boolean
  /** Total kumulatif ANDAI retur ini di-complete-kan. */
  projectedDpp: number
  projectedVat: number
}

/**
 * Guard kumulatif keras (F-004.2): Σ snapshot completed + kandidat ≤
 * DPP/PPN faktur asal. Toleransi sen 0,01 untuk sisa bagi rounding.
 */
export function checkCumulativeReturnCap(input: {
  sourceDpp: number
  sourceVat: number
  completedDpp: number
  completedVat: number
  candidateDpp: number
  candidateVat: number
}): CumulativeGuard {
  const projectedDpp = safeAdd(input.completedDpp, input.candidateDpp, 2)
  const projectedVat = safeAdd(input.completedVat, input.candidateVat, 2)
  const allowed = projectedDpp <= safeAdd(input.sourceDpp, 0.01, 2) && projectedVat <= safeAdd(input.sourceVat, 0.01, 2)
  return { allowed, projectedDpp, projectedVat }
}

/** Masa pengurang: tanggal nota bila ada, else tanggal retur. */
export function returnDeductionPeriod(returnDate: Date, noteDate?: Date | null): string {
  const d = noteDate ?? returnDate
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Baris tanpa snapshot = legacy: hitung-ulang berlabel, bukan snapshot. */
export function isLegacyReturnLine(line: { returnDpp?: number | null; returnVat?: number | null }): boolean {
  return line.returnDpp == null || line.returnVat == null
}

import { safeAdd, safeSubtract, type SafeMathInput } from "@/lib/utils/math"
import { SETTLEMENT_TOLERANCE_IDR } from "@/lib/finance/settlement-status"

/**
 * Nama warisan era ambang lokal (FIN-BR-006): dipertahankan karena dipakai
 * lintas modul, nilainya TURUNAN dari `SETTLEMENT_TOLERANCE_IDR` (Rp1) —
 * bukan angka tulis ulang. Ambang lokal `0,005` di domain piutang/hutang
 * DILARANG (putusan Lead Q-EPS-1/Q-EPS-2, vonis Accountant F-2026-10-28-130-V).
 */
export const COLLECTION_SETTLED_EPSILON = SETTLEMENT_TOLERANCE_IDR

/**
 * Ambang "sisa dianggap lunas" DIDEFINISIKAN di sini sebagai alias warisan:
 * `COLLECTION_SETTLED_EPSILON = SETTLEMENT_TOLERANCE_IDR` (Rp1, FIN-BR-006).
 * Konstanta lokal `0,005` yang dulu ada di sini SUDAH dihapus (PR #1275):
 * faktur sisa Rp0,50 tampil "Lunas" di layar faktur tetapi masih dihitung
 * piutang di antrean/statement/antrean tukar faktur bila ambang beda.
 * Semua pemakai populasi memakai `isOutstandingSettled()` / konstanta
 * warisan ini supaya hanya ada SATU ambang.
 */

/** Sisa piutang = grandTotal − paid, presisi sen (bukan float mentah). */
export function receivableOutstanding(grandTotal: SafeMathInput, paidAmount: SafeMathInput): number {
  return safeSubtract(grandTotal, paidAmount, 2)
}

/** Sisa utang NETO = grandTotal − withholding − paid, presisi sen. */
export function payableOutstanding(
  grandTotal: SafeMathInput,
  withholdingAmount: SafeMathInput,
  paidAmount: SafeMathInput,
): number {
  return safeSubtract(safeSubtract(grandTotal, withholdingAmount ?? 0, 2), paidAmount, 2)
}

/** Jumlahkan nominal presisi sen. */
export function sumMoney(amounts: readonly SafeMathInput[]): number {
  return amounts.reduce<number>((s, a) => safeAdd(s, a, 2), 0)
}

export interface AgingItemInput {
  party: string
  documentNo: string
  dueDate: Date
  outstanding: number
}

export interface AgingBucketTotals {
  buckets: { key: string; count: number; total: number }[]
  grandTotal: number
}

/** Total per bucket umur + grand total, presisi sen. */
export function buildAgingTotals(
  items: readonly AgingItemInput[],
  bucketOf: (item: AgingItemInput) => string,
  bucketOrder: readonly string[],
): AgingBucketTotals {
  const groups = new Map<string, { count: number; total: number }>()
  for (const item of items) {
    const key = bucketOf(item)
    const g = groups.get(key) ?? { count: 0, total: 0 }
    g.count += 1
    g.total = safeAdd(g.total, item.outstanding, 2)
    groups.set(key, g)
  }
  return {
    buckets: bucketOrder.map((key) => ({
      key,
      count: groups.get(key)?.count ?? 0,
      total: groups.get(key)?.total ?? 0,
    })),
    grandTotal: sumMoney(items.map((i) => i.outstanding)),
  }
}

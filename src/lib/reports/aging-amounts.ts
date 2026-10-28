import { safeAdd, safeSubtract, type SafeMathInput } from "@/lib/utils/math"

/**
 * Ambang "sisa dianggap lunas" TIDAK lagi didefinisikan di sini.
 *
 * Sebelumnya berkas ini mengekspor `COLLECTION_SETTLED_EPSILON = 0,005`
 * (setengah sen) sementara FIN-BR-006 menetapkan toleransi Rp1 — akibatnya
 * satu faktur dengan sisa Rp0,50 tampil "Lunas" di layar faktur tetapi masih
 * dihitung piutang di antrean penagihan/statement/antrean tukar faktur.
 * Sekarang semua pemakai memakai `isOutstandingSettled()`
 * (`@/lib/finance/settlement-status`) supaya hanya ada SATU ambang.
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

/**
 * Read-model selisih revisi penawaran vs pekerjaan berjalan
 * (F-2026-10-20-103, lapis aman backend).
 *
 * PUTUSAN manager 22:41 + vonis Salsa 22:38: inti model JobChangeOrder +
 * aksi terapkan DITUNDA-teknis (default tanpa dokumen change order baru
 * aktif). Lapis aman ini hanya MEMBACA: membandingkan snapshot grandTotal
 * revisi terakhir di QuotationHistory (ditulis reviseQuotation sebelum
 * increment, sales.actions.ts) dengan grandTotal berjalan penawaran,
 * lalu menyatakan arah uang yang SAH menurut jalur existing — naik lewat
 * createDifferenceInvoice, turun lewat createRevisionDownCredit
 * (sales.actions.ts). Read-model ini TIDAK memanggil kedua aksi itu,
 * TIDAK menulis jurnal, dan TIDAK mengubah Quotation.grandTotal.
 *
 * Selisih dihitung dalam sen integer (Decimal 15,2 -> sen) supaya tidak
 * ada drift float; sumber nilai tunggal = grandTotal, bukan subtotal
 * atau total WO/SO kedua (larangan vonis Salsa poin 1a).
 */

export const QUOTATION_REVISION_DELTA_NOTICE =
  "Read-only: selisih ini hanya informasi. Kenaikan nilai tertagih lewat " +
  "faktur selisih existing dan penurunan lewat kredit revisi-turun existing; " +
  "tidak ada jurnal atau dokumen change order yang dibuat dari sini."

export type RevisionDeltaDirection = "naik" | "turun" | "tetap"

export interface QuotationRevisionDelta {
  quotationId: number
  /** Revisi snapshot terakhir (0 bila belum pernah direvisi). */
  revisionNumber: number
  /** Snapshot grandTotal revisi terakhir, sen. Null bila tak ada snapshot. */
  snapshotTotalCents: number | null
  /** grandTotal berjalan, sen. */
  currentTotalCents: number
  /** current - snapshot, sen. Null bila tak ada snapshot. */
  deltaCents: number | null
  direction: RevisionDeltaDirection
  /** Jalur uang existing yang sah untuk arah ini; null bila tetap/tanpa snapshot. */
  billingPath: "difference-invoice" | "revision-down-credit" | null
  notice: string
}

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100)
}

export interface QuotationRevisionDeltaInput {
  quotationId: number
  revisionNumber: number
  snapshotGrandTotal: number | null
  currentGrandTotal: number
}

export function buildQuotationRevisionDelta(
  input: QuotationRevisionDeltaInput,
): QuotationRevisionDelta {
  const currentTotalCents = toCents(input.currentGrandTotal)
  if (input.snapshotGrandTotal === null) {
    return {
      quotationId: input.quotationId,
      revisionNumber: input.revisionNumber,
      snapshotTotalCents: null,
      currentTotalCents,
      deltaCents: null,
      direction: "tetap",
      billingPath: null,
      notice: QUOTATION_REVISION_DELTA_NOTICE,
    }
  }
  const snapshotTotalCents = toCents(input.snapshotGrandTotal)
  const deltaCents = currentTotalCents - snapshotTotalCents
  const direction: RevisionDeltaDirection =
    deltaCents > 0 ? "naik" : deltaCents < 0 ? "turun" : "tetap"
  return {
    quotationId: input.quotationId,
    revisionNumber: input.revisionNumber,
    snapshotTotalCents,
    currentTotalCents,
    deltaCents,
    direction,
    billingPath:
      direction === "naik"
        ? "difference-invoice"
        : direction === "turun"
          ? "revision-down-credit"
          : null,
    notice: QUOTATION_REVISION_DELTA_NOTICE,
  }
}

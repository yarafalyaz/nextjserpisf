/**
 * Ambang persetujuan penawaran (F-2026-10-20-100, lapis aman).
 *
 * `ApprovalWorkflowStep.conditions` disimpan tetapi tidak pernah dibaca:
 * penawaran dengan diskon besar dapat berpindah sent->accepted tanpa satu
 * pun evaluasi ambang. Lapis aman ini hanya MENILAI dan MENAMPILKAN —
 * tidak menahan dokumen (perilaku berjalan dipertahankan, PUTUSAN manager
 * 21:16). Inti yang menahan `sendQuotation`/`acceptQuotation` ditunda-teknis
 * sampai helper ini membuktikan celah nominal nyata.
 *
 * Definisi angka (satu-satunya, dipakai helper dan pembaca UI):
 * - subtotal penawaran SUDAH neto per baris: `computeQuotationLine`
 *   menyimpan `total = qty*unitPrice - diskonBaris`, dan
 *   `computeQuotationTotals` menjumlah total baris menjadi
 *   `Quotation.subtotal`. Jadi diskon baris TIDAK terlihat lagi dari
 *   header — persen efektif dihitung dari diskon header saja terhadap
 *   nilai sesudah diskon baris.
 * - Nilai acuan persen = `subtotal + discount` (nilai sebelum diskon
 *   header, sesudah diskon baris). Persen efektif =
 *   `discount / (subtotal + discount) * 100`, dibulatkan 2 desimal.
 *   Subtotal 0 -> persen 0 (tidak ada yang didiskon).
 * - Ambang dari `conditions` (Json bebas, bentuk tidak dijamin skema):
 *   hanya kunci numerik sah yang dibaca — `minDiscountPercent`
 *   (persen, 0..100) dan `minAmount` (nominal terhadap `grandTotal`).
 *   Kunci lain / nilai tak terbaca / di luar rentang = diabaikan, bukan
 *   ditebak. Tanpa satu pun ambang sah -> langkah tidak dievaluasi
 *   (mundur kompatibel: workflow lama tanpa conditions tetap lolos).
 * - Logika DAN (pola Accurate): langkah terpicu hanya bila SEMUA ambang
 *   yang terkonfigurasi terpenuhi. Satu ambang -> ambang itu saja.
 *
 * Pure (tanpa Prisma/DOM). Loader workflow di quotation-approval-gate-data.ts.
 */

import { safeDivide, safeMultiply, safeRound } from "@/lib/utils/math"

export interface QuotationApprovalGateQuotation {
  subtotal: number
  discount: number
  grandTotal: number
}

export interface QuotationApprovalThresholds {
  /** Ambang persen diskon efektif; null = tidak terkonfigurasi. */
  minDiscountPercent: number | null
  /** Ambang nominal grandTotal; null = tidak terkonfigurasi. */
  minAmount: number | null
}

export interface QuotationApprovalGateStep {
  stepOrder: number
  name: string | null
  thresholds: QuotationApprovalThresholds
  /** false = langkah tanpa ambang sah, tidak dievaluasi. */
  evaluated: boolean
  /** Semua ambang terkonfigurasi terpenuhi (logika DAN). */
  triggered: boolean
}

export interface QuotationApprovalGate {
  /** Persen diskon header efektif terhadap nilai sebelum diskon header. */
  discountPercent: number
  grandTotal: number
  steps: QuotationApprovalGateStep[]
  /** Ada langkah terpicu — penanda tampil saja, BUKAN penahan dokumen. */
  requiresApproval: boolean
  /** Ada langkah dengan ambang sah untuk dievaluasi. */
  hasConfiguredThresholds: boolean
}

function numericThreshold(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** Baca ambang dari `conditions` Json satu langkah. Nilai tak sah diabaikan. */
export function parseApprovalThresholds(conditions: unknown): QuotationApprovalThresholds {
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) {
    return { minDiscountPercent: null, minAmount: null }
  }
  const record = conditions as Record<string, unknown>
  const percent = numericThreshold(record.minDiscountPercent)
  const amount = numericThreshold(record.minAmount)
  return {
    minDiscountPercent:
      percent !== null && percent > 0 && percent <= 100 ? safeRound(percent, 2) : null,
    minAmount: amount !== null && amount > 0 ? amount : null,
  }
}

/** Persen diskon header efektif; 0 bila tidak ada nilai yang didiskon. */
export function effectiveDiscountPercent(quotation: QuotationApprovalGateQuotation): number {
  const discount = Math.max(0, quotation.discount)
  const base = quotation.subtotal + discount
  if (base <= 0 || discount <= 0) return 0
  return safeRound(safeDivide(safeMultiply(discount, 100, 4), base, 4), 2)
}

export function evaluateQuotationApprovalGate(
  quotation: QuotationApprovalGateQuotation,
  steps: readonly { stepOrder: number; name?: string | null; conditions?: unknown }[],
): QuotationApprovalGate {
  const discountPercent = effectiveDiscountPercent(quotation)
  const grandTotal = Math.max(0, quotation.grandTotal)

  const evaluatedSteps: QuotationApprovalGateStep[] = steps.map((step) => {
    const thresholds = parseApprovalThresholds(step.conditions)
    const evaluated = thresholds.minDiscountPercent !== null || thresholds.minAmount !== null
    const triggered =
      evaluated &&
      (thresholds.minDiscountPercent === null || discountPercent >= thresholds.minDiscountPercent) &&
      (thresholds.minAmount === null || grandTotal >= thresholds.minAmount)
    return {
      stepOrder: step.stepOrder,
      name: step.name ?? null,
      thresholds,
      evaluated,
      triggered,
    }
  })

  return {
    discountPercent,
    grandTotal,
    steps: evaluatedSteps,
    requiresApproval: evaluatedSteps.some((s) => s.triggered),
    hasConfiguredThresholds: evaluatedSteps.some((s) => s.evaluated),
  }
}

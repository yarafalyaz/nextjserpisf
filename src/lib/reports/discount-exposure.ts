/**
 * F-2026-10-25-006-S tahap 1 — paparan diskon efektif dokumen penjualan.
 *
 * Baca-saja murni (BR-DX-03, Q-DX-1): builder menghitung, tidak menulis
 * dokumen/status/jurnal/notifikasi dan tidak menahan dokumen apa pun.
 *
 * Definisi tunggal (BR-DX-01/02): diskon efektif dokumen = Sigma discount
 * baris (nominal rupiah tersimpan) + discount header tertahan
 * [0, subtotal neto] mengikuti semantik simpan existing, terhadap bruto
 * Sigma(qty*unitPrice). Persen tampil dibulatkan 2 desimal; bruto <= 0 ->
 * persen 0 (EC-1). Berbeda dari F-100 yang hanya melihat diskon header.
 *
 * Label ambang (BR-DX-04): hanya dari thresholds hasil
 * `parseApprovalThresholds` konfigurasi ApprovalWorkflowStep existing per
 * modelType (logika DAN per langkah, pola gate F-100). Tanpa satu pun
 * ambang sah -> TANPA_AMBANG; dilarang ambang bawaan. Perbandingan label
 * memakai persen sebelum dibulatkan tampil (BR-DX-10).
 *
 * Populasi (Q-DX-3) ditegakkan loader; builder menerima dokumen apa
 * adanya. Penjual null = ember "Tanpa Penjual Tercatat" (BR-DX-07).
 * Persen agregat tertimbang nominal (BR-DX-09), bukan rata-rata persen.
 *
 * Pure (tanpa Prisma/DOM). Loader: `discount-exposure-data.ts`.
 */

import { safeDivide, safeMultiply, safeRound } from "@/lib/utils/math"
import type { QuotationApprovalThresholds } from "@/lib/reports/quotation-approval-gate"

export const DISCOUNT_EXPOSURE_DOC_TYPES = ["QUOTATION", "SALES_ORDER", "SALES_INVOICE"] as const
export type DiscountExposureDocType = (typeof DISCOUNT_EXPOSURE_DOC_TYPES)[number]

export const DISCOUNT_EXPOSURE_DOC_TYPE_LABELS: Record<DiscountExposureDocType, string> = {
  QUOTATION: "Penawaran",
  SALES_ORDER: "Pesanan Penjualan",
  SALES_INVOICE: "Faktur Penjualan",
}

/** ModelType ApprovalWorkflow existing per jenis dokumen (loader). */
export const DISCOUNT_EXPOSURE_MODEL_TYPES: Record<DiscountExposureDocType, string> = {
  QUOTATION: "Quotation",
  SALES_ORDER: "SalesOrder",
  SALES_INVOICE: "SalesInvoice",
}

export const DISCOUNT_EXPOSURE_THRESHOLD_LABELS = {
  MELEBIHI_AMBANG: "Melebihi Ambang",
  DI_BAWAH_AMBANG: "Di Bawah Ambang",
  TANPA_AMBANG: "Tanpa Ambang Terkonfigurasi",
} as const
export type DiscountExposureThresholdLabel = keyof typeof DISCOUNT_EXPOSURE_THRESHOLD_LABELS

/** Ember penjual kosong verbatim spec §6 (BR-DX-07). */
export const DISCOUNT_EXPOSURE_NO_SELLER_LABEL = "Tanpa Penjual Tercatat"

/** Notice wajib verbatim spec §6 — UI menempel apa adanya. */
export const DISCOUNT_EXPOSURE_NOTICE_TEXT =
  "Paparan ini baca-saja untuk pengawasan. Label ambang mengikuti konfigurasi persetujuan yang sudah ada; dokumen tidak ditahan oleh laporan ini."

export interface DiscountExposureLineInput {
  qty: number
  unitPrice: number
  /** Nominal rupiah tersimpan per baris (BR-DX-02), bukan persen. */
  discount: number
}

export interface DiscountExposureDocInput {
  docType: DiscountExposureDocType
  docId: number
  slug: string | null
  documentNo: string
  date: Date
  status: string
  customerId: number
  customerName: string
  /** Snapshot penjual dokumen; null = ember Tanpa Penjual Tercatat. */
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Subtotal neto tersimpan (sesudah diskon baris, sebelum diskon header). */
  subtotal: number
  /** Diskon header nominal tersimpan; ditahan [0, subtotal] di builder (EC-2). */
  headerDiscount: number
  grandTotal: number
  lines: DiscountExposureLineInput[]
}

/** Ambang terkonfigurasi per jenis dokumen (sudah diparse loader). */
export type DiscountExposureThresholdsByType = Partial<
  Record<DiscountExposureDocType, QuotationApprovalThresholds[]>
>

export interface DiscountExposureDocRow extends DiscountExposureDocInput {
  bruto: number
  diskonBaris: number
  /** Diskon header sesudah ditahan [0, subtotal neto]. */
  diskonHeader: number
  diskonEfektif: number
  /** Persen efektif tampil (2 desimal); bruto <= 0 -> 0. */
  persenEfektif: number
  labelAmbang: DiscountExposureThresholdLabel
  labelAmbangText: string
  /** Nama penjual tampil: nama snapshot atau ember jujur. */
  penjualLabel: string
}

export interface DiscountExposureSummaryRow {
  docType: DiscountExposureDocType
  docTypeLabel: string
  /** null = ember Tanpa Penjual Tercatat. */
  salesEmployeeId: number | null
  penjualLabel: string
  jumlahDokumen: number
  totalBruto: number
  totalDiskonEfektif: number
  /** Tertimbang nominal: Sigma diskon / Sigma bruto (BR-DX-09). */
  persenTertimbang: number
  jumlahMelebihiAmbang: number
}

export interface DiscountExposure {
  dokumen: DiscountExposureDocRow[]
  ringkasan: DiscountExposureSummaryRow[]
  totalDokumen: number
  totalBruto: number
  totalDiskonEfektif: number
  persenTertimbang: number
  jumlahMelebihiAmbang: number
}

function evaluateThresholdLabel(
  persenUnrounded: number,
  grandTotal: number,
  thresholdsList: QuotationApprovalThresholds[] | undefined,
): DiscountExposureThresholdLabel {
  const configured = (thresholdsList ?? []).filter(
    (t) => t.minDiscountPercent !== null || t.minAmount !== null,
  )
  if (configured.length === 0) return "TANPA_AMBANG"
  const triggered = configured.some(
    (t) =>
      (t.minDiscountPercent === null || persenUnrounded >= t.minDiscountPercent) &&
      (t.minAmount === null || grandTotal >= t.minAmount),
  )
  return triggered ? "MELEBIHI_AMBANG" : "DI_BAWAH_AMBANG"
}

export function buildDiscountExposure(
  inputs: DiscountExposureDocInput[],
  thresholdsByType: DiscountExposureThresholdsByType = {},
): DiscountExposure {
  const dokumen: DiscountExposureDocRow[] = inputs.map((input) => {
    const bruto = input.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
    const diskonBaris = input.lines.reduce((sum, l) => sum + Math.max(0, l.discount), 0)
    // EC-2: header melebihi subtotal neto (data lama) tertahan, tidak negatif.
    const diskonHeader = Math.min(Math.max(0, input.headerDiscount), Math.max(0, input.subtotal))
    const diskonEfektif = diskonBaris + diskonHeader
    const persenUnrounded =
      bruto > 0 && diskonEfektif > 0
        ? safeDivide(safeMultiply(diskonEfektif, 100, 4), bruto, 4)
        : 0
    const labelAmbang = evaluateThresholdLabel(
      persenUnrounded,
      Math.max(0, input.grandTotal),
      thresholdsByType[input.docType],
    )
    return {
      ...input,
      bruto: safeRound(bruto, 2),
      diskonBaris: safeRound(diskonBaris, 2),
      diskonHeader: safeRound(diskonHeader, 2),
      diskonEfektif: safeRound(diskonEfektif, 2),
      persenEfektif: safeRound(persenUnrounded, 2),
      labelAmbang,
      labelAmbangText: DISCOUNT_EXPOSURE_THRESHOLD_LABELS[labelAmbang],
      penjualLabel: input.salesEmployeeName ?? DISCOUNT_EXPOSURE_NO_SELLER_LABEL,
    }
  })

  dokumen.sort((a, b) => {
    if (a.persenEfektif !== b.persenEfektif) return b.persenEfektif - a.persenEfektif
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.docId - b.docId
  })

  const summaryByKey = new Map<string, DiscountExposureSummaryRow>()
  for (const row of dokumen) {
    const key = `${row.docType}:${row.salesEmployeeId ?? "tanpa-penjual"}`
    const existing = summaryByKey.get(key) ?? {
      docType: row.docType,
      docTypeLabel: DISCOUNT_EXPOSURE_DOC_TYPE_LABELS[row.docType],
      salesEmployeeId: row.salesEmployeeId,
      penjualLabel: row.penjualLabel,
      jumlahDokumen: 0,
      totalBruto: 0,
      totalDiskonEfektif: 0,
      persenTertimbang: 0,
      jumlahMelebihiAmbang: 0,
    }
    existing.jumlahDokumen += 1
    existing.totalBruto += row.bruto
    existing.totalDiskonEfektif += row.diskonEfektif
    if (row.labelAmbang === "MELEBIHI_AMBANG") existing.jumlahMelebihiAmbang += 1
    summaryByKey.set(key, existing)
  }

  const ringkasan = Array.from(summaryByKey.values()).map((row) => ({
    ...row,
    totalBruto: safeRound(row.totalBruto, 2),
    totalDiskonEfektif: safeRound(row.totalDiskonEfektif, 2),
    persenTertimbang:
      row.totalBruto > 0
        ? safeRound(safeDivide(safeMultiply(row.totalDiskonEfektif, 100, 4), row.totalBruto, 4), 2)
        : 0,
  }))
  ringkasan.sort((a, b) => {
    const typeDiff =
      DISCOUNT_EXPOSURE_DOC_TYPES.indexOf(a.docType) - DISCOUNT_EXPOSURE_DOC_TYPES.indexOf(b.docType)
    if (typeDiff !== 0) return typeDiff
    return a.penjualLabel.localeCompare(b.penjualLabel)
  })

  const totalBruto = dokumen.reduce((sum, r) => sum + r.bruto, 0)
  const totalDiskonEfektif = dokumen.reduce((sum, r) => sum + r.diskonEfektif, 0)
  return {
    dokumen,
    ringkasan,
    totalDokumen: dokumen.length,
    totalBruto: safeRound(totalBruto, 2),
    totalDiskonEfektif: safeRound(totalDiskonEfektif, 2),
    persenTertimbang:
      totalBruto > 0
        ? safeRound(safeDivide(safeMultiply(totalDiskonEfektif, 100, 4), totalBruto, 4), 2)
        : 0,
    jumlahMelebihiAmbang: dokumen.filter((r) => r.labelAmbang === "MELEBIHI_AMBANG").length,
  }
}

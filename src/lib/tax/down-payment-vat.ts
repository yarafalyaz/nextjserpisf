/**
 * PPN uang muka DP/termin — matematika + status turunan murni
 * (F-2026-10-25-004-V, vonis BOT Accountant PR #760 merged 5e8b5ebf).
 *
 * Aturan mengikat dari vonis:
 * - FP UM terutang per DP CONFIRMED (PER-11/PJ/2025 Pasal 31(2)b/c),
 *   snapshot DPP/PPN dari `amount` diterima lewat
 *   `computeVatFromSellingPrice` pola existing — TANPA rumus kedua,
 *   TANPA hardcode tarif/faktor di luar fungsi itu.
 * - Jurnal DP memecah kas: Cr 210102 = amount - ppnUangMuka,
 *   Cr 210201 = ppnUangMuka. Pendapatan nol saat DP.
 * - Pelunasan anti-dobel: FP pelunasan snapshot SELISIH (dokumen penuh
 *   dikurangi Sigma FP UM aktif); GL 210201 netto = ppnUangMuka (J-DP1)
 *   + PPN dokumen penuh (J-PL1) - Sigma ppnUangMuka reklas (J-PL1)
 *   = PPN dokumen penuh tepat satu kali. Negatif = fail-closed.
 * - Status pajak DP turunan dari snapshot + dokumen pajak tertaut,
 *   BUKAN dari status dokumen/pembayaran/posting.
 *
 * Pure (tanpa Prisma/DOM). Uang sen 2 desimal via helper math existing.
 */

import { safeAdd, safeRound, safeSubtract } from "@/lib/utils/math"
import {
  computeVatFromSellingPrice,
  taxPeriodFromDate,
  type TransactionCode,
} from "@/lib/tax/tax-invoice"

/** Snapshot pajak DP dibekukan saat confirm (tidak hitung ulang saat baca). */
export interface DownPaymentVatSnapshot {
  /** DP terutang PPN (quotation memuat PPN dan snapshot PPN > 0). */
  taxable: boolean
  transactionCode: TransactionCode
  /** Tarif nominal yang berlaku saat confirm, dibekukan apa adanya. */
  nominalRate: number
  dppUangMuka: number
  ppnUangMuka: number
  /** Kredit kewajiban 210102 = amount - ppnUangMuka (J-DP1/J-DP2). */
  liabilityAmount: number
  /** Masa pajak dari paymentDate (diturunkan, bukan input bebas). */
  taxPeriod: string
}

/**
 * Hitung snapshot FP UM dari nilai diterima. `quotationTax <= 0`
 * (penawaran tanpa PPN / tidak terutang) = snapshot nol tanpa FP UM
 * (J-DP2 bruto). Tarif/kode dari pemanggil (master/default existing),
 * dibekukan ke hasil.
 */
export function computeDownPaymentVatSnapshot(input: {
  amount: number
  quotationTax: number
  paymentDate: Date
  transactionCode: TransactionCode
  nominalRate: number
}): DownPaymentVatSnapshot {
  const amount = safeRound(input.amount, 2)
  const taxPeriod = taxPeriodFromDate(input.paymentDate)
  if (!(input.quotationTax > 0)) {
    return {
      taxable: false,
      transactionCode: input.transactionCode,
      nominalRate: input.nominalRate,
      dppUangMuka: 0,
      ppnUangMuka: 0,
      liabilityAmount: amount,
      taxPeriod,
    }
  }
  const computed = computeVatFromSellingPrice(amount, input.transactionCode, input.nominalRate)
  const ppnUangMuka = safeRound(computed.taxAmount, 2)
  return {
    taxable: ppnUangMuka > 0,
    transactionCode: input.transactionCode,
    nominalRate: computed.nominalRate,
    dppUangMuka: safeRound(computed.dpp, 2),
    ppnUangMuka,
    liabilityAmount: safeSubtract(amount, ppnUangMuka, 2),
    taxPeriod,
  }
}

/** Baris master Tax kandidat tarif efektif (bentuk baca hook DP). */
export interface EffectiveVatTaxRow {
  rate: number
  effectiveFrom?: Date | string | null
  effectiveTo?: Date | string | null
  isActive?: boolean | null
  deletedAt?: Date | string | null
}

function effectiveTime(value: Date | string | null | undefined): number | null {
  if (value == null) return null
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

/** Status PKP perusahaan penjual (F-2026-10-25-015-V Putusan 1). */
export type CompanyPkpStatus = "non_pkp" | "pkp" | "unknown"

/** Nilai master SystemSetting mentah yang dibaca gerbang PKP. */
export interface CompanyPkpSetting {
  companyPkpStatus?: string | null
  companyPkpEffectiveFrom?: Date | string | null
}

function toCalendarTime(value: Date | string | null | undefined): number | null {
  const t = effectiveTime(value)
  if (t == null) return null
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Gerbang PKP perusahaan F-2026-10-25-015-V Putusan 2 (murni, tanpa
 * Prisma): apakah DP atas quotation ber-PPN terutang FP UM pada
 * paymentDate. Tiga syarat kumulatif — status pkp, tanggal mulai
 * kewajiban <= paymentDate, quotation.tax > 0 (tarif efektif dinilai
 * pemanggil lewat resolveEffectiveVatRate).
 * - `unknown` + quotation ber-PPN = fail-closed berisik (status belum
 *   ditetapkan; JANGAN dibaca non-PKP/PKP diam-diam).
 * - `pkp` tanpa tanggal mulai kewajiban = konfigurasi cacat,
 *   fail-closed berisik (tanggal SPPKP tidak ditebak).
 * - `non_pkp` / belum efektif = jalur sah J-DP2 bruto (bukan error).
 * - quotation tax=0 tidak pernah terhalang gerbang.
 * Status PKP lawan transaksi dan transactionCode TIDAK dibaca di
 * sini (Putusan 4) — gerbang hanya memutus terutang/tidak.
 */
export function resolveCompanyPkpGate(input: {
  setting: CompanyPkpSetting | null | undefined
  quotationTax: number
  paymentDate: Date
}): { taxableByPkp: boolean; pkpStatus: CompanyPkpStatus; pkpEffectiveFrom: Date | null } {
  const raw = (input.setting?.companyPkpStatus ?? "unknown").trim().toLowerCase()
  const pkpStatus: CompanyPkpStatus = raw === "pkp" || raw === "non_pkp" ? raw : "unknown"
  const effTime = toCalendarTime(input.setting?.companyPkpEffectiveFrom)
  const pkpEffectiveFrom = effTime == null ? null : new Date(effTime)
  if (!(input.quotationTax > 0)) return { taxableByPkp: false, pkpStatus, pkpEffectiveFrom }
  if (pkpStatus === "unknown") {
    throw new Error(
      "Penerimaan uang muka ditolak: status PKP perusahaan belum ditetapkan. Tetapkan status PKP perusahaan (PKP/non-PKP beserta tanggal mulai kewajiban) di Pengaturan Perusahaan sebelum menerima uang muka atas penawaran ber-PPN.",
    )
  }
  if (pkpStatus === "pkp" && pkpEffectiveFrom == null) {
    throw new Error(
      "Penerimaan uang muka ditolak: perusahaan berstatus PKP tetapi tanggal mulai kewajiban PKP belum diisi. Isi tanggal mulai kewajiban PKP di Pengaturan Perusahaan — tanggal SPPKP tidak ditebak.",
    )
  }
  const payTime = toCalendarTime(input.paymentDate)
  return {
    taxableByPkp: pkpStatus === "pkp" && effTime != null && payTime != null && effTime <= payTime,
    pkpStatus,
    pkpEffectiveFrom,
  }
}

/**
 * B1 (re-audit Accountant PR #785): tarif snapshot DP WAJIB dari master
 * Tax yang efektif pada paymentDate — BUKAN konstanta. Kandidat =
 * baris aktif, belum dihapus, jendela efektif mencakup paymentDate
 * (effectiveFrom <= paymentDate; effectiveTo kosong / >= paymentDate).
 * Tepat satu tarif unik wajib; nol baris atau lebih dari satu tarif
 * berbeda = fail-closed berisik (operator rapikan master, sistem
 * tidak menebak). Pemanggil membatasi kandidat ke pajak keluaran
 * (accountId = akun PPN Keluaran setting).
 */
export function resolveEffectiveVatRate(rows: EffectiveVatTaxRow[], paymentDate: Date): number {
  const at = paymentDate.getTime()
  const rates = new Set<number>()
  for (const row of rows) {
    if (row.isActive === false || row.deletedAt != null) continue
    const from = effectiveTime(row.effectiveFrom)
    const to = effectiveTime(row.effectiveTo)
    if (from != null && from > at) continue
    if (to != null && to < at) continue
    rates.add(safeRound(Number(row.rate), 2))
  }
  if (rates.size === 0) {
    throw new Error(
      "Tarif PPN uang muka ditolak: tidak ada baris master Tax (PPN Keluaran) yang efektif pada tanggal penerimaan DP. Atur master pajak bertanggal efektif dulu — tarif tidak ditebak dari konstanta.",
    )
  }
  if (rates.size > 1) {
    throw new Error(
      `Tarif PPN uang muka ditolak: master Tax efektif pada tanggal penerimaan DP ambigu (${[...rates].join(", ")}%). Rapikan jendela efektif master pajak — satu tarif wajib berlaku per tanggal.`,
    )
  }
  return [...rates][0]
}

/** Snapshot dari baris DownPayment tersimpan (kolom vat* nullable). */
export function snapshotFromDownPaymentRow(row: {
  vatTransactionCode?: string | null
  vatRate?: unknown
  vatDpp?: unknown
  vatAmount?: unknown
  vatTaxPeriod?: string | null
  amount?: unknown
} | null | undefined): DownPaymentVatSnapshot | null {
  if (!row || row.vatAmount == null || row.vatDpp == null || row.vatTaxPeriod == null) return null
  const ppnUangMuka = safeRound(Number(row.vatAmount), 2)
  const amount = safeRound(Number(row.amount ?? 0), 2)
  return {
    taxable: ppnUangMuka > 0,
    transactionCode: (row.vatTransactionCode ?? "04") as TransactionCode,
    nominalRate: Number(row.vatRate ?? 0),
    dppUangMuka: safeRound(Number(row.vatDpp), 2),
    ppnUangMuka,
    liabilityAmount: safeSubtract(amount, ppnUangMuka, 2),
    taxPeriod: row.vatTaxPeriod,
  }
}

/** Sigma snapshot FP UM tertaut (satu-satunya penjumlahan uang muka). */
export function sumDownPaymentVat(uangMuka: { dppUangMuka: number; ppnUangMuka: number }[]): {
  sigmaDppUangMuka: number
  sigmaPpnUangMuka: number
} {
  return {
    sigmaDppUangMuka: safeRound(uangMuka.reduce((s, u) => safeAdd(s, u.dppUangMuka, 2), 0), 2),
    sigmaPpnUangMuka: safeRound(uangMuka.reduce((s, u) => safeAdd(s, u.ppnUangMuka, 2), 0), 2),
  }
}

/**
 * Kaki reklas J-PL1 saja (dipakai jurnal posting faktur): Dr 210201
 * Sigma ppnUangMuka / Cr Piutang Sigma ppnUangMuka. PPN dokumen <
 * Sigma = fail-closed. Kosong bila tidak ada DP terutang tertaut.
 */
export function buildSettlementReclass(input: {
  documentPpn: number
  uangMuka: { dppUangMuka: number; ppnUangMuka: number }[]
}): VatJournalLine[] {
  const { sigmaPpnUangMuka } = sumDownPaymentVat(input.uangMuka)
  if (safeSubtract(safeRound(input.documentPpn, 2), sigmaPpnUangMuka, 2) < 0) {
    throw new Error(
      `Posting faktur pelunasan ditolak: PPN dokumen (${safeRound(input.documentPpn, 2)}) lebih kecil dari Sigma PPN uang muka tertaut (${sigmaPpnUangMuka}). Periksa FP UM tertaut sebelum posting.`,
    )
  }
  return sigmaPpnUangMuka > 0
    ? [
        { account: "salesTax", debit: sigmaPpnUangMuka, credit: 0, memo: "Reklas PPN uang muka ke faktur pelunasan" },
        { account: "receivable", debit: 0, credit: sigmaPpnUangMuka, memo: "Reklas PPN uang muka mengurangi piutang" },
      ]
    : []
}

export interface VatJournalLine {
  /** Kunci akun semantik; pemanggil memetakan ke accountId setting existing. */
  account: "cashBank" | "downPaymentLiability" | "salesTax" | "receivable"
  debit: number
  credit: number
  memo: string
}

/**
 * J-DP1 (terutang) / J-DP2 (tidak terutang): Dr Kas = amount penuh;
 * kredit pecah kewajiban neto vs PPN Keluaran hanya bila ppn > 0.
 * Tidak ada kaki pendapatan/HPP/stok — pendapatan nol saat DP.
 */
export function buildDownPaymentReceiptLines(input: {
  amount: number
  snapshot: DownPaymentVatSnapshot
}): VatJournalLine[] {
  const amount = safeRound(input.amount, 2)
  const lines: VatJournalLine[] = [
    { account: "cashBank", debit: amount, credit: 0, memo: "Bank/Cash received" },
  ]
  if (input.snapshot.ppnUangMuka > 0) {
    lines.push(
      { account: "downPaymentLiability", debit: 0, credit: input.snapshot.liabilityAmount, memo: "Uang Muka Penjualan (neto PPN uang muka)" },
      { account: "salesTax", debit: 0, credit: input.snapshot.ppnUangMuka, memo: "PPN Keluaran uang muka (FP UM)" },
    )
  } else {
    lines.push({ account: "downPaymentLiability", debit: 0, credit: amount, memo: "Uang Muka Penjualan" })
  }
  return lines
}

/**
 * J-RF1: refund DP ber-FP UM sesudah FP batal tercatat.
 * Dr 210102 porsi neto + Dr 210201 porsi PPN / Cr Kas = amount refund.
 * Porsi PPN proporsional terhadap amount DP asal, sen-persis.
 */
export function buildDownPaymentRefundLines(input: {
  refundAmount: number
  dpAmount: number
  snapshot: DownPaymentVatSnapshot
}): VatJournalLine[] {
  const refundAmount = safeRound(input.refundAmount, 2)
  const ppnPortion =
    input.dpAmount > 0 && input.snapshot.ppnUangMuka > 0
      ? safeRound((input.snapshot.ppnUangMuka * refundAmount) / input.dpAmount, 2)
      : 0
  const lines: VatJournalLine[] = []
  if (ppnPortion > 0) {
    lines.push(
      { account: "downPaymentLiability", debit: safeSubtract(refundAmount, ppnPortion, 2), credit: 0, memo: "Refund kewajiban uang muka (neto PPN)" },
      { account: "salesTax", debit: ppnPortion, credit: 0, memo: "Refund PPN Keluaran uang muka (FP UM batal)" },
    )
  } else {
    lines.push({ account: "downPaymentLiability", debit: refundAmount, credit: 0, memo: "Refund kewajiban uang muka" })
  }
  lines.push({ account: "cashBank", debit: 0, credit: refundAmount, memo: "Bank/Cash refund uang muka" })
  return lines
}

/**
 * J-PL2: alokasi DP bersnapshot ke faktur — kaki kewajiban/piutang NETO
 * PPN. Porsi PPN teralokasi proporsional; alokasi penutup
 * (kumulatif = amount DP) menyerap residu sen supaya Sigma neto
 * teralokasi = liabilityAmount snapshot persis.
 */
export function computeAllocationNet(input: {
  allocAmount: number
  previouslyAllocated: number
  snapshot: DownPaymentVatSnapshot
  dpAmount: number
}): { netAmount: number; ppnPortion: number } {
  const allocAmount = safeRound(input.allocAmount, 2)
  if (input.snapshot.ppnUangMuka <= 0 || input.dpAmount <= 0) {
    return { netAmount: allocAmount, ppnPortion: 0 }
  }
  const cumulative = safeAdd(input.previouslyAllocated, allocAmount, 2)
  const ppnPortion =
    cumulative >= safeRound(input.dpAmount, 2)
      ? safeSubtract(
          input.snapshot.ppnUangMuka,
          safeRound((input.snapshot.ppnUangMuka * safeRound(input.previouslyAllocated, 2)) / input.dpAmount, 2),
          2,
        )
      : safeSubtract(
          safeRound((input.snapshot.ppnUangMuka * cumulative) / input.dpAmount, 2),
          safeRound((input.snapshot.ppnUangMuka * safeRound(input.previouslyAllocated, 2)) / input.dpAmount, 2),
          2,
        )
  return { netAmount: safeSubtract(allocAmount, ppnPortion, 2), ppnPortion }
}

/** Hasil reklas pelunasan J-PL1 + snapshot FP pelunasan selisih. */
export interface SettlementVatResult {
  /** Sigma ppnUangMuka FP UM/snapshot DP confirmed tertaut quotation. */
  sigmaPpnUangMuka: number
  sigmaDppUangMuka: number
  /** FP pelunasan = dokumen penuh - Sigma FP UM (snapshot selisih). */
  settlementDpp: number
  settlementPpn: number
  /**
   * Kaki reklas dalam jurnal posting faktur yang sama:
   * Dr 210201 Sigma ppnUangMuka / Cr Piutang Sigma ppnUangMuka.
   * Kosong bila belum ada DP terutang tertaut.
   */
  reclassLines: VatJournalLine[]
}

/**
 * Anti-dobel Putusan 3: PPN dokumen penuh < Sigma ppnUangMuka =
 * fail-closed (lempar Error). Identitas: ppnUangMuka + PPN dokumen
 * penuh - Sigma ppnUangMuka (reklas) = PPN dokumen penuh.
 */
export function buildSettlementVat(input: {
  documentDpp: number
  documentPpn: number
  uangMuka: { dppUangMuka: number; ppnUangMuka: number }[]
}): SettlementVatResult {
  const { sigmaPpnUangMuka, sigmaDppUangMuka } = sumDownPaymentVat(input.uangMuka)
  const documentPpn = safeRound(input.documentPpn, 2)
  if (safeSubtract(documentPpn, sigmaPpnUangMuka, 2) < 0 || safeSubtract(safeRound(input.documentDpp, 2), sigmaDppUangMuka, 2) < 0) {
    throw new Error(
      `Posting faktur pelunasan ditolak: PPN/DPP dokumen (${input.documentDpp}/${documentPpn}) lebih kecil dari Sigma PPN uang muka tertaut (${sigmaDppUangMuka}/${sigmaPpnUangMuka}). Periksa FP UM tertaut sebelum posting.`,
    )
  }
  return {
    sigmaPpnUangMuka,
    sigmaDppUangMuka,
    settlementDpp: safeSubtract(input.documentDpp, sigmaDppUangMuka, 2),
    settlementPpn: safeSubtract(documentPpn, sigmaPpnUangMuka, 2),
    reclassLines:
      sigmaPpnUangMuka > 0
        ? [
            { account: "salesTax", debit: sigmaPpnUangMuka, credit: 0, memo: "Reklas PPN uang muka ke faktur pelunasan" },
            { account: "receivable", debit: 0, credit: sigmaPpnUangMuka, memo: "Reklas PPN uang muka mengurangi piutang" },
          ]
        : [],
  }
}

/** Empat status pajak DP (Putusan 3) — turunan, bukan flag bebas. */
export type DownPaymentTaxStatus =
  | "bukan-subjek"
  | "terutang-belum-terbit"
  | "fp-um-terbit"
  | "fp-um-batal"

export const DOWN_PAYMENT_TAX_STATUS_LABELS: Record<DownPaymentTaxStatus, string> = {
  "bukan-subjek": "Bukan subjek FP uang muka",
  "terutang-belum-terbit": "PPN uang muka terutang — FP UM belum terbit",
  "fp-um-terbit": "FP uang muka terbit",
  "fp-um-batal": "FP uang muka batal",
}

/**
 * Turunan status pajak: hanya dari status DP + snapshot + dokumen
 * pajak tertaut (djpStatus). DP belum confirmed = bukan-subjek
 * (peristiwa pajak lahir saat confirm, bukan draft).
 */
export function deriveDownPaymentTaxStatus(input: {
  dpStatus: string
  snapshot: DownPaymentVatSnapshot | null
  /** djpStatus FP UM tertaut aktif terakhir; null = belum ada dokumen. */
  linkedTaxInvoiceStatus: string | null
}): DownPaymentTaxStatus {
  if (input.dpStatus !== "confirmed" || !input.snapshot?.taxable) return "bukan-subjek"
  if (input.linkedTaxInvoiceStatus === "cancelled") return "fp-um-batal"
  // Putusan 3: FP UM draft di Coretax TIDAK mengubah status jadi terbit —
  // hanya FP berstatus approved yang terbit. Draft/rejected tetap terutang.
  if (input.linkedTaxInvoiceStatus === "approved") return "fp-um-terbit"
  return "terutang-belum-terbit"
}

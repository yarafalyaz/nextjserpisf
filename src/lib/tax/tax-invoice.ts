/**
 * PPN faktur pajak — matematika murni (F-001/F-002).
 *
 * Vonis FINAL accountant F-2026-10-21-001/002:
 * - Sejak PMK-131/2024, penyerahan BKP non-mewah + SEMUA JKP memakai
 *   DPP nilai lain 11/12 × tarif nominal 12% (efektif 11%). Default
 *   sistem untuk penjualan normal ERP: kode transaksi `04`.
 * - Kode `01` BUKAN default lagi (hanya BKP mewah objek PPnBM);
 *   `04` BUKAN untuk BKP mewah.
 * - Jurnal dari DPP FAKTUR × tarif nominal: Dr Piutang (DPP faktur + PPN),
 *   Cr Pendapatan sebesar harga jual PENUH (bukan DPP 11/12), Cr PPN
 *   Keluaran = 12% × DPP faktur. Selisih harga jual vs DPP = mekanisme
 *   tarif, bukan diskon — jangan jurnal akun selisih.
 * - SPT pengganti: dilaporkan pada MASA FAKTUR DIGANTI (PER-11/PJ/2025) —
 *   hanya kepala rantai terakhir bernilai; yang diganti referensi nol-efek.
 * - Kredit masukan: default masa TANGGAL FAKTUR pemasok; boleh geser ke
 *   masa berikut, maks 3 masa sesudah masa faktur (Jan → terakhir Apr).
 *   Lewat batas → `expired`.
 *
 * Pure (tanpa Prisma/DOM). Uang Decimal(15,2), tarif Decimal(5,2) —
 * tanpa `Number()` mentah di hitung DPP/PPN.
 */

import { safeAdd, safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"

/** Kode transaksi PER-11/PJ/2025 yang didukung Silengkap (10 kode). */
export const TRANSACTION_CODES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] as const
export type TransactionCode = (typeof TRANSACTION_CODES)[number]

/** Default sistem untuk penjualan normal ERP (PMK-131/2024). */
export const DEFAULT_TRANSACTION_CODE: TransactionCode = "04"

/** Tarif nominal PPN Pasal 7(1) UU PPN. */
export const NOMINAL_VAT_RATE = 12

/** Faktor DPP nilai lain PMK-131/2024: 11/12. */
export const OTHER_VALUE_FACTOR_NUMERATOR = 11
export const OTHER_VALUE_FACTOR_DENOMINATOR = 12

/** Status DJP faktur. */
export const DJP_STATUSES = ["draft", "approved", "rejected", "replaced", "cancelled"] as const
export type DjpStatus = (typeof DJP_STATUSES)[number]

/** Status kredit masukan. */
export const CREDIT_STATUSES = ["uncredited", "credited", "not_creditable", "expired"] as const
export type CreditStatus = (typeof CREDIT_STATUSES)[number]

/**
 * Alasan tidak dapat dikreditkan (UU PPN 9(8)). Wajib bila
 * creditStatus = `not_creditable`.
 */
export const NON_CREDITABLE_REASONS = [
  "PRE_PKP",
  "NO_DIRECT_RELATION",
  "VEHICLE_SEDAN_SW",
  "FOREIGN_USE_PRE_PKP",
  "INVALID_INVOICE",
  "FOREIGN_INVALID",
  "ASSESSED",
  "UNREPORTED_FOUND_ON_AUDIT",
  "PRE_PRODUCTION_NON_CAPITAL",
  "BY_POLICY_EXEMPT_OUTPUT",
] as const
export type NonCreditableReason = (typeof NON_CREDITABLE_REASONS)[number]

export type TransactionCodeHint = {
  /** Pemungut instansi pemerintah (→ 02) / pemungut lain / Pasal 32A UU KUP (→ 03). */
  collector?: "government" | "other" | null
  /** Fasilitas: dibebaskan (→ 08) / tidak dipungut-DTP (→ 07). */
  facility?: "exempt" | "not_collected" | null
  /** Aktiva Pasal 16D — hanya dari modul disposal aset (→ 09). */
  assetDisposal?: boolean
  /** Jenis usaha/transaksi terdaftar PMK besaran tertentu Pasal 9A (→ 05). */
  specialRateRegistered?: boolean
  /** Tenant toko retail peserta VAT-refund turis (→ 06). */
  touristRefundParticipant?: boolean
  /** Tarif selain Pasal 7(1) UU PPN (→ 10). */
  nonStandardRate?: boolean
  /** DPP nilai lain PMK tersendiri incl. PMK-131 (→ 04). */
  otherValueBasis?: boolean
  /** BKP mewah objek PPnBM — DPP penuh tarif umum (→ 01). */
  luxuryGoods?: boolean
}

/**
 * Pilih kode transaksi, urut prioritas pertama-cocok-menang (vonis F-001).
 * Default jatuh ke `04` (DPP nilai lain PMK-131), bukan `01`.
 */
export function pickTransactionCode(hint: TransactionCodeHint = {}): TransactionCode {
  if (hint.collector === "government") return "02"
  if (hint.collector === "other") return "03"
  if (hint.facility === "exempt") return "08"
  if (hint.facility === "not_collected") return "07"
  if (hint.assetDisposal) return "09"
  if (hint.specialRateRegistered) return "05"
  if (hint.touristRefundParticipant) return "06"
  if (hint.nonStandardRate) return "10"
  if (hint.luxuryGoods) return "01"
  if (hint.otherValueBasis) return "04"
  return DEFAULT_TRANSACTION_CODE
}

/** Kode 04 memakai DPP nilai lain 11/12; sisanya DPP penuh. */
export function usesOtherValueBasis(code: TransactionCode): boolean {
  return code === "04"
}

export interface VatComputation {
  /** DPP faktur (11/12 × harga jual bila kode 04). */
  dpp: number
  /** Tarif nominal (12). */
  nominalRate: number
  /** PPN = 12% × DPP faktur. */
  taxAmount: number
  /** Piutang = DPP faktur + PPN. */
  receivable: number
  /** Pendapatan = harga jual PENUH (bukan DPP). */
  revenue: number
}

/**
 * Hitung DPP + PPN dari harga jual/penggantian penuh.
 * Falsifikasi (a): 12.000.000 → DPP 11.000.000, PPN 1.320.000,
 * pendapatan tetap 12.000.000.
 */
export function computeVatFromSellingPrice(
  sellingPrice: number,
  code: TransactionCode = DEFAULT_TRANSACTION_CODE,
  nominalRate = NOMINAL_VAT_RATE,
): VatComputation {
  const price = safeRound(sellingPrice, 2)
  const dpp = usesOtherValueBasis(code)
    ? safeRound((price * OTHER_VALUE_FACTOR_NUMERATOR) / OTHER_VALUE_FACTOR_DENOMINATOR, 2)
    : price
  const taxAmount = safeMultiply(dpp, nominalRate / 100, 2)
  return {
    dpp,
    nominalRate,
    taxAmount,
    receivable: safeAdd(dpp, taxAmount, 2),
    revenue: price,
  }
}

/** Masa "YYYY-MM" dari tanggal faktur (DITURUNKAN, bukan input bebas). */
export function taxPeriodFromDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

/** Normalisasi kode Coretax tampil ("010" → kanonik "10"). */
export function normalizeTransactionCode(raw: string): TransactionCode {
  const digits = raw.replace(/\D/g, "")
  const n = Number.parseInt(digits === "" ? "0" : digits.replace(/^0+(?=\d)/, ""), 10)
  const canon = String(Number.isNaN(n) ? 4 : n).padStart(2, "0")
  return ((TRANSACTION_CODES as readonly string[]).includes(canon) ? canon : "04") as TransactionCode
}

/** Selisih masa dalam bulan: credit − invoice (Jan→Apr = 3). */
export function monthDiff(fromPeriod: string, toPeriod: string): number {
  const [fy, fm] = fromPeriod.split("-").map(Number)
  const [ty, tm] = toPeriod.split("-").map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** Jendela kredit: 0..3 masa sesudah masa faktur. Negatif = masa lampau. */
export function isCreditWindowOpen(invoicePeriod: string, creditPeriod: string): boolean {
  const diff = monthDiff(invoicePeriod, creditPeriod)
  return diff >= 0 && diff <= 3
}

export interface CreditEligibility {
  eligible: boolean
  /** expired | out_of_window_past | ok */
  reason: "ok" | "expired" | "out_of_window_past"
}

/**
 * Kelayakan masa kredit masukan (F-002). Falsifikasi (c): faktur bulan
 * ke-4 sesudah masa faktur → `expired`, ditolak.
 */
export function checkCreditEligibility(invoicePeriod: string, creditPeriod: string): CreditEligibility {
  const diff = monthDiff(invoicePeriod, creditPeriod)
  if (diff < 0) return { eligible: false, reason: "out_of_window_past" }
  if (diff > 3) return { eligible: false, reason: "expired" }
  return { eligible: true, reason: "ok" }
}

/**
 * Nomor faktur pajak masukan dianggap valid bila cocok pola Zod form
 * (huruf/angka/spasi/titik/strip, maks 50 karakter) — SATU sumber untuk
 * guard confirm bill, hook posting jurnal, dan aksi isi-nomor pasca-posting.
 * Definisi pola milik Zod form `src/lib/validations/tax-invoice.schemas.ts`;
 * duplikasi regex di hook dilarang (penjaga report-format Konsistensi pola).
 */
export const VENDOR_TAX_INVOICE_NUMBER_PATTERN = /^[0-9A-Za-z][0-9A-Za-z .-]*$/

export function isValidVendorTaxInvoiceNumber(raw: unknown): boolean {
  if (raw == null) return false
  const t = String(raw).trim()
  if (t === "") return false
  return VENDOR_TAX_INVOICE_NUMBER_PATTERN.test(t) && t.length <= 50
}

/**
 * Porsi kreditabel utk penyerahan campur: hanya porsi itu Dr PPN Masukan,
 * sisa kapitalisasi/beban. Falsifikasi (e): sedan non-kreditabel →
 * creditablePercent 0 → PPN Masukan nol.
 */
export function creditableSplit(taxAmount: number, creditablePercent: number): { creditable: number; nonCreditable: number } {
  const pct = Math.min(100, Math.max(0, safeRound(creditablePercent, 2)))
  const creditable = safeRound((safeRound(taxAmount, 2) * pct) / 100, 2)
  return { creditable, nonCreditable: safeSubtract(taxAmount, creditable, 2) }
}

export interface ChainInvoice {
  id: number
  djpStatus: string
  dpp: number
  taxAmount: number
}

/**
 * Efektif SPT per rantai pengganti (F-001): hanya kepala rantai terakhir
 * yang bernilai; yang diganti tampil referensi nol-efek. Rantai diurut
 * asal → pengganti; kepala = elemen terakhir berstatus bukan
 * `cancelled`/`replaced`. Kepala hanya bernilai bila `approved`:
 * `rejected` (ditolak DJP) dan `draft` (belum ada bukti DJP) nol-efek —
 * keduanya tidak menambah PPN Keluaran posisi SPT.
 */
export function effectiveChainHead(chain: ChainInvoice[]): ChainInvoice | null {
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const c = chain[i]
    if (c.djpStatus === "cancelled" || c.djpStatus === "replaced") continue
    return c.djpStatus === "approved" ? c : null
  }
  return null
}

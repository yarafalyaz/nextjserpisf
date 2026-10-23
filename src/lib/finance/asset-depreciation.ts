/**
 * Mesin penyusutan aset tetap — vonis BOT 4 F-2026-10-22-062-V Putusan 2 & 4.
 *
 * Aturan yang dikunci di sini:
 *  - Daftar metode TERDAFTAR hidup satu tempat (`DEPRECIATION_METHODS`).
 *    Metode yang boleh melahirkan jurnal GL hanya `GL_DEPRECIATION_METHODS`
 *    (garis lurus + saldo menurun). Metode analitis terdaftar
 *    (`units_of_production`, `sum_of_years_digits`) sah secara PSAK 16 tetapi
 *    ANALITIS NON-GL: cron wajib menolaknya berisik, tidak menjatuhkannya
 *    diam-diam ke garis lurus. String di luar daftar = tidak dikenal.
 *  - Seluruh hitung uang memakai Decimal (`Prisma.Decimal`, presisi schema
 *    Decimal(15,2)); tidak ada float JS di jalur uang. Bulanan dibulatkan ke
 *    sen saat jurnal; bulan terakhir clamp supaya nilai buku berhenti PERSIS
 *    di nilai residu.
 *
 * Pure kecuali tipe Decimal dari Prisma Client (nilai, bukan koneksi DB).
 */

import { Prisma } from "@prisma/client"

export const DEPRECIATION_METHODS = [
  "straight_line",
  "declining_balance",
  "units_of_production",
  "sum_of_years_digits",
] as const

export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number]

/** Metode yang boleh memposting jurnal penyusutan GL. */
export const GL_DEPRECIATION_METHODS: readonly DepreciationMethod[] = [
  "straight_line",
  "declining_balance",
]

/** Metode terdaftar tetapi analitis NON-GL (PSAK 16, tanpa mesin jurnal). */
export const ANALYTICAL_DEPRECIATION_METHODS: readonly DepreciationMethod[] = [
  "units_of_production",
  "sum_of_years_digits",
]

export function isRegisteredDepreciationMethod(
  value: string | null | undefined,
): value is DepreciationMethod {
  return (
    typeof value === "string" &&
    (DEPRECIATION_METHODS as readonly string[]).includes(value)
  )
}

export function isGlDepreciationMethod(
  value: string | null | undefined,
): value is "straight_line" | "declining_balance" {
  return value === "straight_line" || value === "declining_balance"
}

export function isAnalyticalDepreciationMethod(
  value: string | null | undefined,
): boolean {
  return value === "units_of_production" || value === "sum_of_years_digits"
}

const ZERO = new Prisma.Decimal(0)

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

export interface DepreciationInput {
  /** Harga perolehan. */
  purchaseCost: Prisma.Decimal | number | string
  /**
   * Nilai buku SEBELUM periode ini — wajib dasar jurnal POSTED
   * (`journalBookValue`), bukan cache `Asset.currentValue` (Putusan 1).
   */
  bookValue: Prisma.Decimal | number | string
  /** Nilai residu (lantai penyusutan). */
  residualValue: Prisma.Decimal | number | string
  depreciationMethod: string | null | undefined
  /** Tarif tahunan kategori dalam PERSEN (mis. 20 = 20%/thn), atau null. */
  categoryDepreciationRate: Prisma.Decimal | number | string | null | undefined
  /** Umur manfaat kategori dalam TAHUN, atau null. */
  categoryUsefulLife: number | null | undefined
}

export type MonthlyDepreciationResult =
  | { status: "computed"; amount: Prisma.Decimal }
  | { status: "skip"; reason: "at-residual" | "no-basis" }
  | { status: "reject"; reason: "analytical-method" | "unknown-method"; method: string }

/**
 * Hitung penyusutan bulanan satu aset.
 * - `computed` amount > 0, sudah dibulatkan ke sen dan di-clamp ke residu.
 * - `skip` = memang tidak ada yang disusutkan periode ini (di/bawah residu,
 *   atau tidak ada basis tarif/umur) — bukan kesalahan.
 * - `reject` = metode tidak boleh diproses cron (analitis NON-GL atau string
 *   tak terdaftar) — pemanggil WAJIB mencatat error berisik per aset.
 */
export function computeMonthlyDepreciation(
  input: DepreciationInput,
): MonthlyDepreciationResult {
  const method = input.depreciationMethod ?? "straight_line"
  if (!isRegisteredDepreciationMethod(method)) {
    return { status: "reject", reason: "unknown-method", method: String(method) }
  }
  if (!isGlDepreciationMethod(method)) {
    return { status: "reject", reason: "analytical-method", method }
  }

  const purchaseCost = dec(input.purchaseCost)
  const bookValue = dec(input.bookValue)
  const floor = Prisma.Decimal.max(ZERO, dec(input.residualValue))

  if (bookValue.lte(floor)) return { status: "skip", reason: "at-residual" }

  const rate =
    input.categoryDepreciationRate == null ? null : dec(input.categoryDepreciationRate)
  const life = input.categoryUsefulLife ?? null

  let monthly: Prisma.Decimal | null = null
  if (method === "declining_balance" && rate && rate.gt(0)) {
    // Saldo menurun: nilai buku x tarif tahunan / 12.
    monthly = bookValue.mul(rate).div(100).div(12)
  } else if (life && life > 0) {
    // Garis lurus atas dasar terdepresiasi: (perolehan - residu) / bulan umur.
    monthly = purchaseCost.sub(floor).div(life * 12)
  } else if (rate && rate.gt(0)) {
    // Garis lurus berbasis tarif atas dasar terdepresiasi.
    monthly = purchaseCost.sub(floor).mul(rate).div(100).div(12)
  }

  if (!monthly || monthly.lte(0)) return { status: "skip", reason: "no-basis" }

  // Bulan terakhir: clamp supaya nilai buku berhenti persis di residu.
  const remaining = bookValue.sub(floor)
  if (monthly.gt(remaining)) monthly = remaining

  const rounded = monthly.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  if (rounded.lte(0)) return { status: "skip", reason: "no-basis" }
  // Pembulatan ke sen tidak boleh melewati sisa di atas residu.
  return {
    status: "computed",
    amount: Prisma.Decimal.min(rounded, remaining.toDecimalPlaces(2)),
  }
}

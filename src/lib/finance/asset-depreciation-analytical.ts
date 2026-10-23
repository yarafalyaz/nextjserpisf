/**
 * Mesin analitis UOP/SYD — vonis BOT 4 F-2026-10-23-118-V Putusan 2-3.
 *
 * Fungsi murni Decimal, TANPA DB, TANPA jurnal. Hasil fungsi ini boleh
 * diposting hanya lewat inti `asset-analytical-posting.ts` (gerbang
 * Putusan 2: parameter terbekukan per aset + dokumen unit aktual +
 * `assertPeriodOpen` dalam tx + idempotensi per masa). Jangan panggil
 * langsung dari jalur posting jurnal lain. `computeMonthlyDepreciation`
 * tetap menolak kedua metode untuk GL (`analytical-method`).
 *
 * Rumus (Putusan 3, Decimal sen, tanpa float):
 *  - UOP: (harga perolehan − residu) × unitAktual / totalEstimasiUnit,
 *    di-clamp nilai buku sesudah >= residu. Unit 0 = beban 0 (`unit-nol`).
 *  - SYD: N masa manfaat bulan dibekukan, S = N(N+1)/2, bulan ke-k:
 *    (harga perolehan − residu) × (N−k+1)/S; bulan terakhir clamp persis
 *    ke residu (selisih pembulatan masuk bulan terakhir).
 * Parameter kosong/nol = tolak berisik (`missing-parameter`), dilarang
 * menebak dari kategori fiskal (Putusan 2a). Fiskal tidak pernah analitis.
 */

import { Prisma } from "@prisma/client"

const ZERO = new Prisma.Decimal(0)

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

export type AnalyticalDepreciationResult =
  | { status: "computed"; amount: Prisma.Decimal }
  | { status: "skip"; reason: "at-residual" | "unit-nol" }
  | { status: "reject"; reason: "missing-parameter"; parameter: string }

export interface UnitsOfProductionInput {
  purchaseCost: Prisma.Decimal | number | string
  bookValue: Prisma.Decimal | number | string
  residualValue: Prisma.Decimal | number | string
  /** Unit aktual masa ini dari dokumen sumber bernama (Putusan 2b). */
  actualUnits: Prisma.Decimal | number | string | null | undefined
  /** Total estimasi unit seumur aset, dibekukan per aset (Putusan 2a). */
  totalEstimatedUnits: Prisma.Decimal | number | string | null | undefined
}

export interface SumOfYearsDigitsInput {
  purchaseCost: Prisma.Decimal | number | string
  bookValue: Prisma.Decimal | number | string
  residualValue: Prisma.Decimal | number | string
  /** Masa manfaat komersial dalam bulan, dibekukan (Putusan 2a). */
  usefulLifeMonths: number | null | undefined
  /** Bulan ke-berapa (1-based) sejak penyusutan dimulai. */
  monthIndex: number | null | undefined
}

function clampToResidual(
  amount: Prisma.Decimal,
  bookValue: Prisma.Decimal,
  floor: Prisma.Decimal,
): Prisma.Decimal {
  const remaining = bookValue.sub(floor)
  const rounded = amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  return Prisma.Decimal.min(rounded, remaining.toDecimalPlaces(2))
}

export function computeUnitsOfProductionDepreciation(
  input: UnitsOfProductionInput,
): AnalyticalDepreciationResult {
  if (input.totalEstimatedUnits == null || !dec(input.totalEstimatedUnits).gt(0)) {
    return { status: "reject", reason: "missing-parameter", parameter: "totalEstimatedUnits" }
  }
  if (input.actualUnits == null || dec(input.actualUnits).lt(0)) {
    return { status: "reject", reason: "missing-parameter", parameter: "actualUnits" }
  }
  const purchaseCost = dec(input.purchaseCost)
  const bookValue = dec(input.bookValue)
  const floor = Prisma.Decimal.max(ZERO, dec(input.residualValue))
  if (bookValue.lte(floor)) return { status: "skip", reason: "at-residual" }

  const actual = dec(input.actualUnits)
  // Putusan 4 F-118-V: unit 0 = beban 0 hasil rumus, bukan tolak/garis lurus.
  if (actual.eq(0)) return { status: "skip", reason: "unit-nol" }

  const raw = purchaseCost.sub(floor).mul(actual).div(dec(input.totalEstimatedUnits))
  return { status: "computed", amount: clampToResidual(raw, bookValue, floor) }
}

export function computeSumOfYearsDigitsDepreciation(
  input: SumOfYearsDigitsInput,
): AnalyticalDepreciationResult {
  // Syarat inti posting (review BOT 6 PR #633, low): nilai non-integer
  // wajib ditolak berisik — N=3.5 / k=1.5 bukan masa manfaat/bulan sah.
  if (
    input.usefulLifeMonths == null ||
    !Number.isInteger(input.usefulLifeMonths) ||
    input.usefulLifeMonths <= 0
  ) {
    return { status: "reject", reason: "missing-parameter", parameter: "usefulLifeMonths" }
  }
  if (
    input.monthIndex == null ||
    !Number.isInteger(input.monthIndex) ||
    input.monthIndex < 1
  ) {
    return { status: "reject", reason: "missing-parameter", parameter: "monthIndex" }
  }
  const n = input.usefulLifeMonths
  const k = input.monthIndex
  const purchaseCost = dec(input.purchaseCost)
  const bookValue = dec(input.bookValue)
  const floor = Prisma.Decimal.max(ZERO, dec(input.residualValue))
  if (bookValue.lte(floor)) return { status: "skip", reason: "at-residual" }
  if (k > n) return { status: "skip", reason: "at-residual" }

  const s = new Prisma.Decimal((n * (n + 1)) / 2)
  const raw = purchaseCost.sub(floor).mul(n - k + 1).div(s)
  return { status: "computed", amount: clampToResidual(raw, bookValue, floor) }
}

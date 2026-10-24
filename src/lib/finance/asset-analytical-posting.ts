/**
 * Inti posting analitis UOP/SYD — vonis BOT 4 F-2026-10-23-118-V Putusan 2.
 *
 * Gerbang boleh memposting (SEMUA wajib; satu gugur = tetap NON-GL):
 *  (a) parameter terbekukan per aset (`Asset.totalEstimatedUnits` /
 *      `usefulLifeMonths`, bukan kategori fiskal);
 *  (b) dokumen unit aktual bernama (`AssetUsageRecord`) untuk UOP;
 *  (c) rumus Decimal mesin analitis + clamp residu;
 *  (d) `assertPeriodOpen` dalam tx + idempotensi satu jurnal per
 *      (aset, masa) lewat unique (referenceType, referenceId);
 *  (e) akun beban/akumulasi mapping fail-closed;
 *  (f) fiskal tidak ikut — modul ini tidak menyentuh saldo fiskal.
 *
 * Dasar hitung = nilai buku jurnal POSTED (F-062-V Putusan 1), bukan
 * `Asset.currentValue`. `held_for_sale` menghentikan komersial apa pun
 * metodenya (F-118-V Putusan 4/F-117-V); status tak terdaftar ditolak
 * berisik. Revisi parameter = edit kolom sebelum jurnal masa itu lahir;
 * jurnal lampau tidak pernah dihitung ulang di sini.
 * Pure kecuali tipe Decimal dari Prisma Client (nilai, bukan koneksi DB).
 */

import { Prisma } from "@prisma/client"
import {
  computeSumOfYearsDigitsDepreciation,
  computeUnitsOfProductionDepreciation,
  type AnalyticalDepreciationResult,
} from "./asset-depreciation-analytical"

export type AnalyticalAssetStatus =
  | AnalyticalDepreciationResult
  | { status: "skip"; reason: "held-for-sale" | "disposed" | "already-posted" | "not-started" }
  | { status: "reject"; reason: "unregistered-status"; method: string }

export interface AnalyticalAssetInput {
  depreciationMethod: string | null | undefined
  /** `Asset.status` mentah. */
  status: string | null | undefined
  /** Harga perolehan berjurnal POSTED (F-062-V Putusan 1). */
  purchaseCost: Prisma.Decimal | number | string
  /** Nilai buku jurnal POSTED awal masa. */
  bookValue: Prisma.Decimal | number | string
  residualValue: Prisma.Decimal | number | string
  /** Terbekukan per aset: total estimasi unit UOP (Putusan 2a). */
  totalEstimatedUnits: Prisma.Decimal | number | string | null | undefined
  /** Terbekukan per aset: masa manfaat komersial bulan SYD (Putusan 2a). */
  usefulLifeMonths: number | null | undefined
  /** Unit aktual masa ini dari dokumen bernama; null = dokumen belum ada. */
  actualUnits: Prisma.Decimal | number | string | null | undefined
  /** Tanggal perolehan; SYD monthIndex diturunkan darinya. */
  purchaseDate: Date | null | undefined
  periodYear: number
  periodMonth: number
  /** Jurnal masa ini sudah POSTED (idempotensi Putusan 2d). */
  alreadyPosted: boolean
}

/** Bulan ke-k (1-based) sejak bulan perolehan; null bila belum mulai. */
export function analyticalMonthIndex(
  purchaseDate: Date | null | undefined,
  periodYear: number,
  periodMonth: number,
): number | null {
  if (!purchaseDate) return null
  const start =
    purchaseDate.getUTCFullYear() * 12 + purchaseDate.getUTCMonth()
  const period = periodYear * 12 + (periodMonth - 1)
  const index = period - start + 1
  return index >= 1 ? index : null
}

/**
 * Status analitis satu aset untuk satu masa — kontrak final ke konsumen
 * (BOT 2): computed / skip{at-residual,unit-nol,held-for-sale,disposed,
 * already-posted,not-started} / reject{missing-parameter,unregistered-status}.
 * `disposed` tidak pernah computed (M-1 audit BOT 6 t_1d595a1e): aset
 * sudah dilepas tidak menanggung beban analitis masa berjalan.
 */
export function resolveAnalyticalAssetStatus(
  input: AnalyticalAssetInput,
): AnalyticalAssetStatus {
  const status = input.status ?? "active"
  if (status !== "active" && status !== "held_for_sale" && status !== "disposed") {
    return { status: "reject", reason: "unregistered-status", method: status }
  }
  if (status === "held_for_sale") return { status: "skip", reason: "held-for-sale" }
  if (status === "disposed") return { status: "skip", reason: "disposed" }
  if (input.alreadyPosted) return { status: "skip", reason: "already-posted" }

  if (input.depreciationMethod === "units_of_production") {
    return computeUnitsOfProductionDepreciation({
      purchaseCost: input.purchaseCost,
      bookValue: input.bookValue,
      residualValue: input.residualValue,
      actualUnits: input.actualUnits,
      totalEstimatedUnits: input.totalEstimatedUnits,
    })
  }
  if (input.depreciationMethod === "sum_of_years_digits") {
    const monthIndex = analyticalMonthIndex(
      input.purchaseDate,
      input.periodYear,
      input.periodMonth,
    )
    if (monthIndex == null) return { status: "skip", reason: "not-started" }
    return computeSumOfYearsDigitsDepreciation({
      purchaseCost: input.purchaseCost,
      bookValue: input.bookValue,
      residualValue: input.residualValue,
      usefulLifeMonths: input.usefulLifeMonths,
      monthIndex,
    })
  }
  return {
    status: "reject",
    reason: "missing-parameter",
    parameter: "depreciationMethod",
  }
}

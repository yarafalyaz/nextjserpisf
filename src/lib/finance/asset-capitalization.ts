/**
 * Kapitalisasi biaya perbaikan aset — gerbang + basis fiskal sesudah
 * peristiwa, lapis aman vonis BOT 4 F-2026-10-23-108-V (PR #612 MERGED).
 *
 * Lapisan ini MURNI (tanpa Prisma/DB/jurnal):
 *  - Putusan 1: gerbang kapitalisasi vs beban fail-closed (a)-(d). Satu
 *    syarat gugur = `expense` (beban periode), TIDAK pernah ditebak dari
 *    nominal. Klaim menambah masa manfaat TANPA penilai/dasar terstruktur
 *    diperlakukan TIDAK menambah (E108-9) — bukan ditolak, bukan diterima.
 *  - Putusan 2: basis fiskal sesudah = nilai sisa buku fiskal sebelum +
 *    biaya perbaikan (sen persis, Decimal). Sisa masa manfaat fiskal
 *    terhitung ulang dengan PLAFON masa manfaat kelompok (Putusan 2(ii),
 *    E108-3); metode fiskal TIDAK berubah — saldo menurun tetap tarif
 *    kelompok atas basis baru; bangunan hanya garis lurus (tabel
 *    statutoris `asset-fiscal-groups.ts`, jangan tanam tarif di sini).
 *  - Bulan mulai penyusutan atas hasil penjumlahan = bulan pengeluaran
 *    perbaikan, atau bulan selesai pengerjaan bila masih dalam pengerjaan
 *    (Putusan 2, E108-6). Bulan lampau tidak dihitung ulang (pemanggil
 *    wajib hanya menerapkan sejak bulan mulai; fungsi ini tidak menjurnal).
 *
 * Inti (model peristiwa terbekukan, jurnal Dr Aset Tetap fail-closed
 * mapping, idempotency per dokumen sumber, mesin penyusutan membaca basis
 * peristiwa) DITUNDA mengikuti Batas build F-108-V: sesudah usulan kode
 * akun disetujui BOT 4 dan jalur #602 (sudah merged) dipakai inti.
 * Fungsi ini adalah kontrak hitung yang akan dipakai inti itu.
 */

import { Prisma } from "@prisma/client"

import { fiscalAnnualRatePercent, type FiscalGroupRule } from "./asset-fiscal-groups"

const ZERO = new Prisma.Decimal(0)

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

export interface CapitalizationGateInput {
  /** Status aset (`Asset.status`). Selain `active` = bukan kapitalisasi. */
  assetStatus: string | null | undefined
  /** Masa manfaat pengeluaran itu sendiri (bulan). <= 12 = beban (Putusan 1(b)). */
  expenditureUsefulLifeMonths: number | null | undefined
  /**
   * Manfaat masa depan terukur terklasifikasi terstruktur:
   * memperpanjang manfaat / menambah kapasitas / menaikkan mutu.
   * `false`/null = tidak terbukti (Putusan 1(c)).
   */
  hasMeasurableFutureBenefit: boolean | null | undefined
  /** Jumlah pada dokumen sumber dapat diukur andal (Putusan 1(d)). */
  hasReliableSourceAmount: boolean | null | undefined
}

export type CapitalizationClassification =
  | { decision: "capitalize" }
  | {
      decision: "expense"
      /** Syarat Putusan 1 yang gugur, urut (a)-(d). */
      failedConditions: ("a" | "b" | "c" | "d")[]
    }

/**
 * Gerbang Putusan 1. Semua syarat wajib; ambang rupiah TIDAK dipakai.
 * Servis rutin tahunan (manfaat <= 1 tahun) selalu `expense` (E108-1).
 */
export function classifyCapitalization(
  input: CapitalizationGateInput,
): CapitalizationClassification {
  const failed: ("a" | "b" | "c" | "d")[] = []
  if (input.assetStatus !== "active") failed.push("a")
  if (
    input.expenditureUsefulLifeMonths == null ||
    input.expenditureUsefulLifeMonths <= 12
  ) {
    failed.push("b")
  }
  if (input.hasMeasurableFutureBenefit !== true) failed.push("c")
  if (input.hasReliableSourceAmount !== true) failed.push("d")
  return failed.length === 0
    ? { decision: "capitalize" }
    : { decision: "expense", failedConditions: failed }
}

export interface FiscalCapitalizationInput {
  /** Nilai sisa buku FISKAL sebelum perbaikan (sen persis). */
  fiscalBookValueBefore: Prisma.Decimal | number | string
  /** Biaya perbaikan yang lolos gerbang Putusan 1. */
  capitalizationAmount: Prisma.Decimal | number | string
  /** Sisa masa manfaat fiskal berjalan, bulan (sebelum peristiwa). */
  remainingFiscalLifeMonths: number
  /**
   * Klaim tambahan masa manfaat akibat perbaikan, bulan.
   * Hanya terhitung bila `lifeExtensionAssessor` terisi (E108-9).
   */
  claimedLifeExtensionMonths: number | null | undefined
  /** Nama penilai + dasar terstruktur klaim tambahan manfaat; kosong = klaim gugur. */
  lifeExtensionAssessor: string | null | undefined
  /** Kelompok fiskal aset dari tabel statutoris (`fiscalGroupRule`). */
  fiscalGroup: FiscalGroupRule
  /** Metode fiskal aset (tidak berubah oleh perbaikan). */
  fiscalMethod: string
  /** Tanggal pengeluaran perbaikan (bulan mulai default). */
  expenditureDate: Date
  /** Tanggal selesai pengerjaan; terisi = bulan mulai bulan ini (E108-6). */
  completionDate: Date | null | undefined
}

export interface FiscalCapitalizationResult {
  /** Nilai sisa buku fiskal sesudah = sebelum + kapitalisasi, sen persis (E108-2). */
  fiscalBookValueAfter: Prisma.Decimal
  /** Tambahan manfaat yang DIPAKAI sesudah gerbang penilai (0 bila tanpa dasar). */
  appliedLifeExtensionMonths: number
  /**
   * Sisa masa manfaat fiskal dipakai: sisa berjalan + tambahan terpakai,
   * diplafon total masa manfaat kelompok (E108-3).
   */
  remainingFiscalLifeMonthsAfter: number
  /** true bila plafon kelompok memotong sisa terhitung. */
  cappedByGroupLife: boolean
  /**
   * Beban fiskal bulanan atas basis baru: garis lurus = basis / sisa bulan;
   * saldo menurun = basis x tarif kelompok tahunan / 12. Bulan terakhir
   * di-clamp pemanggil terhadap basis berjalan (pola clamp F-062).
   * null bila metode tidak sah untuk kelompok (mis. bangunan saldo menurun).
   */
  monthlyFiscalDepreciation: Prisma.Decimal | null
  /** Bulan mulai penyusutan atas hasil penjumlahan, format YYYY-MM (E108-6). */
  depreciationStartMonth: string
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

/** Hitung basis + jadwal fiskal sesudah kapitalisasi (Putusan 2). */
export function computeFiscalBasisAfterCapitalization(
  input: FiscalCapitalizationInput,
): FiscalCapitalizationResult {
  const before = dec(input.fiscalBookValueBefore)
  const amount = dec(input.capitalizationAmount)
  const after = before.add(amount)

  // E108-9: klaim tambahan tanpa penilai/dasar = diperlakukan tidak menambah.
  const assessor = input.lifeExtensionAssessor?.trim()
  const appliedExtension =
    assessor && input.claimedLifeExtensionMonths != null
      ? Math.max(0, Math.floor(input.claimedLifeExtensionMonths))
      : 0

  const uncapped = Math.max(0, Math.floor(input.remainingFiscalLifeMonths)) + appliedExtension
  const groupLifeMonths = input.fiscalGroup.usefulLifeYears * 12
  const remainingAfter = Math.min(uncapped, groupLifeMonths)

  let monthly: Prisma.Decimal | null = null
  if (after.gt(ZERO) && remainingAfter > 0) {
    if (input.fiscalMethod === "straight_line") {
      monthly = after.div(remainingAfter)
    } else if (input.fiscalMethod === "declining_balance") {
      // Saldo menurun: tarif kelompok atas nilai sisa buku BARU (Putusan 2).
      const rate = fiscalAnnualRatePercent("declining_balance", input.fiscalGroup)
      monthly = rate == null ? null : after.mul(rate).div(100).div(12)
    }
  }
  if (monthly) monthly = monthly.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

  return {
    fiscalBookValueAfter: after.toDecimalPlaces(2),
    appliedLifeExtensionMonths: appliedExtension,
    remainingFiscalLifeMonthsAfter: remainingAfter,
    cappedByGroupLife: uncapped > groupLifeMonths,
    monthlyFiscalDepreciation: monthly,
    depreciationStartMonth: monthKey(input.completionDate ?? input.expenditureDate),
  }
}

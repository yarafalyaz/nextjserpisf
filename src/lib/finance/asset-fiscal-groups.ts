/**
 * Kelompok fiskal aset tetap — tabel VALIDASI statutoris UU PPh Pasal 11 +
 * PMK 72/2023 (vonis BOT 4 F-2026-10-22-062-V Putusan 2).
 *
 * Tabel ini BUKAN konstanta hitung bebas: tarif/umur di sini adalah nilai
 * statutoris yang dipakai untuk memvalidasi konfigurasi kategori dan untuk
 * menghitung sisi fiskal bila kelompok sudah ditentukan. Kelompok disimpan
 * di master kategori (`AssetCategory.taxGroupCode`) bertanggal efektif lewat
 * `effectiveFrom` tabel ini — ganti tarif lewat vonis baru = tambah baris
 * versi, bukan edit angka diam-diam.
 *
 * Penentuan kelompok (Putusan 2, redaksi R1):
 *  (a) jenis harta TERCANTUM di lampiran PMK 72/2023 → kelompok lampiran
 *      WAJIB terisi; kelompok kosong = fiskal BELUM dihitung.
 *  (b) jenis harta TIDAK tercantum → kelompok 3 adalah default statutoris
 *      UU PPh Pasal 11 ayat (6); kelompok kosong = fiskal TETAP dihitung
 *      sebagai kelompok 3. Penetapan DJP (`taxDjpDetermination`) mengalahkan
 *      default itu (kelompok penetapan wajib terisi dan dipakai).
 *
 * Bangunan hanya garis lurus; bukan bangunan boleh garis lurus atau saldo
 * menurun. Tarif saldo menurun = 2x tarif garis lurus (Pasal 11).
 *
 * Pure (tanpa Prisma/DOM). Uang dihitung pemanggil dalam sen/Decimal.
 */

export const FISCAL_GROUP_CODES = [
  "GROUP_1",
  "GROUP_2",
  "GROUP_3",
  "GROUP_4",
  "BUILDING_PERMANENT",
  "BUILDING_NON_PERMANENT",
] as const

export type FiscalGroupCode = (typeof FISCAL_GROUP_CODES)[number]

export interface FiscalGroupRule {
  code: FiscalGroupCode
  label: string
  /** Masa manfaat statutoris (tahun). */
  usefulLifeYears: number
  /** Tarif garis lurus statutoris (% per tahun). */
  straightLineRatePercent: number
  /** Tarif saldo menurun statutoris (% per tahun); null = saldo menurun dilarang (bangunan). */
  decliningBalanceRatePercent: number | null
  isBuilding: boolean
  /** Tanggal efektif tabel validasi ini (UU PPh Pasal 11 / PMK 72/2023). */
  effectiveFrom: string
}

/**
 * Tabel validasi statutoris. Satu-satunya tempat tarif fiskal hidup;
 * logika hitung membaca dari sini, tidak menanam angka sendiri.
 */
export const FISCAL_GROUP_RULES: readonly FiscalGroupRule[] = [
  { code: "GROUP_1", label: "Kelompok 1 (4 tahun)", usefulLifeYears: 4, straightLineRatePercent: 25, decliningBalanceRatePercent: 50, isBuilding: false, effectiveFrom: "2023-01-01" },
  { code: "GROUP_2", label: "Kelompok 2 (8 tahun)", usefulLifeYears: 8, straightLineRatePercent: 12.5, decliningBalanceRatePercent: 25, isBuilding: false, effectiveFrom: "2023-01-01" },
  { code: "GROUP_3", label: "Kelompok 3 (16 tahun)", usefulLifeYears: 16, straightLineRatePercent: 6.25, decliningBalanceRatePercent: 12.5, isBuilding: false, effectiveFrom: "2023-01-01" },
  { code: "GROUP_4", label: "Kelompok 4 (20 tahun)", usefulLifeYears: 20, straightLineRatePercent: 5, decliningBalanceRatePercent: 10, isBuilding: false, effectiveFrom: "2023-01-01" },
  { code: "BUILDING_PERMANENT", label: "Bangunan permanen (20 tahun)", usefulLifeYears: 20, straightLineRatePercent: 5, decliningBalanceRatePercent: null, isBuilding: true, effectiveFrom: "2023-01-01" },
  { code: "BUILDING_NON_PERMANENT", label: "Bangunan tidak permanen (10 tahun)", usefulLifeYears: 10, straightLineRatePercent: 10, decliningBalanceRatePercent: null, isBuilding: true, effectiveFrom: "2023-01-01" },
] as const

const RULE_BY_CODE = new Map<FiscalGroupCode, FiscalGroupRule>(
  FISCAL_GROUP_RULES.map((rule) => [rule.code, rule]),
)

export function fiscalGroupRule(code: string | null | undefined): FiscalGroupRule | null {
  if (!code) return null
  return RULE_BY_CODE.get(code as FiscalGroupCode) ?? null
}

export function isFiscalGroupCode(value: string): value is FiscalGroupCode {
  return RULE_BY_CODE.has(value as FiscalGroupCode)
}

/** Kelompok default statutoris untuk jenis TIDAK tercantum (Pasal 11 ayat (6)). */
export const STATUTORY_DEFAULT_FISCAL_GROUP: FiscalGroupCode = "GROUP_3"

export type FiscalResolution =
  | {
      status: "resolved"
      group: FiscalGroupRule
      /** `explicit` = kelompok terisi; `djp` = penetapan DJP; `statutory-default` = kelompok 3 jenis tak tercantum. */
      source: "explicit" | "djp" | "statutory-default"
    }
  | {
      status: "not-computable"
      reason: "listed-type-without-group" | "unknown-group"
    }

export interface FiscalGroupInput {
  /** Kode kelompok terisi di kategori, atau null/kosong. */
  taxGroupCode: string | null | undefined
  /**
   * Apakah jenis harta kategori ini TERCANTUM di lampiran PMK 72/2023.
   * `null` = belum dinyatakan di master (data lama) — diperlakukan belum-dihitung,
   * BUKAN ditebak tercantum/tidak (jujur, pola laporan existing).
   */
  taxTypeListed: boolean | null | undefined
  /** Ada penetapan DJP untuk jenis ini (mengalahkan default statutoris). */
  taxDjpDetermination: boolean | null | undefined
}

/**
 * Tentukan kelompok fiskal efektif satu kategori.
 * Kelompok terisi selalu menang (explicit; dengan penetapan DJP = `djp`).
 * Kelompok kosong: tercantum → belum-dihitung; tidak tercantum → kelompok 3
 * statutoris; belum dinyatakan → belum-dihitung.
 */
export function resolveFiscalGroup(input: FiscalGroupInput): FiscalResolution {
  const code = input.taxGroupCode?.trim() ? input.taxGroupCode.trim() : null
  if (code) {
    const rule = fiscalGroupRule(code)
    if (!rule) return { status: "not-computable", reason: "unknown-group" }
    return {
      status: "resolved",
      group: rule,
      source: input.taxDjpDetermination ? "djp" : "explicit",
    }
  }
  if (input.taxTypeListed === false) {
    return {
      status: "resolved",
      group: RULE_BY_CODE.get(STATUTORY_DEFAULT_FISCAL_GROUP)!,
      source: "statutory-default",
    }
  }
  return { status: "not-computable", reason: "listed-type-without-group" }
}

/** Metode fiskal sah (UU PPh Pasal 11). Bangunan hanya garis lurus. */
export function isFiscalMethodAllowed(method: string, group: FiscalGroupRule): boolean {
  if (method === "straight_line") return true
  if (method === "declining_balance") return group.decliningBalanceRatePercent !== null
  return false
}

/** Tarif tahunan fiskal (%); null bila metode tidak sah untuk kelompok itu. */
export function fiscalAnnualRatePercent(
  method: string,
  group: FiscalGroupRule,
): number | null {
  if (method === "straight_line") return group.straightLineRatePercent
  if (method === "declining_balance") return group.decliningBalanceRatePercent
  return null
}

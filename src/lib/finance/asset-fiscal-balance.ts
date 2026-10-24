/**
 * Saldo fiskal tahunan aset — builder murni lapis aman vonis BOT 4
 * F-2026-10-23-109-V (PR #613, lanjutan F-2026-10-22-062-V).
 *
 * Lapisan ini MURNI (tanpa Prisma/DB/jurnal):
 *  - P2: saldo fiskal awal perolehan = `purchaseCost` (tanpa residu
 *    komersial). Garis lurus = `purchaseCost x tarifGL` sekali ke sen
 *    per tahun. Saldo menurun = `saldoAwalTahun x tarifSM statutoris`,
 *    sekali ke sen per tahun (bukan bulanan x12); tahun terakhir masa
 *    manfaat kelompok disusutkan SEKALIGUS ke 0 (UU PPh Pasal 11 ayat
 *    (2)). Saldo tidak pernah negatif; clamp 0 sen persis.
 *  - P3: tahun mulai = tahun kalender `purchaseDate`. `purchaseDate`
 *    null = belum-dihitung, dilarang tebak `createdAt`. Rekonstruksi
 *    aset lama hanya dari saldo pembuka bertanggal berlabel `opening`
 *    (input `openingBalance` + `openingYear` eksplisit di sini), bukan
 *    dari `currentValue`/riwayat komersial — builder ini tidak menerima
 *    nilai buku komersial sama sekali.
 *  - P5: metode NULL / bangunan saldo-menurun / tanpa tanggal = null
 *    beralasan terstruktur. DILARANG fallback garis lurus untuk metode
 *    tersimpan saldo menurun.
 *
 * Inti (PR inti F-109-V): baris yang dihasilkan fungsi ini dibekukan
 * pemanggil apa adanya ke `AssetFiscalYearRow` (snapshot P4, unik
 * `(assetId, taxYear)`, generate idempoten); loader
 * `depreciation-difference` membaca `fiscalMethod` + baris itu.
 */

import { Prisma } from "@prisma/client"

import {
  fiscalAnnualRatePercent,
  isFiscalMethodAllowed,
  type FiscalGroupRule,
} from "./asset-fiscal-groups"

const ZERO = new Prisma.Decimal(0)

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

function sen(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

export type FiscalBalanceSource = "computed" | "opening" | "estimasi-tahun-berjalan"

export interface FiscalYearRow {
  /** Tahun pajak baris ini. */
  taxYear: number
  /** Indeks tahun fiskal 1-based sejak tahun mulai (atau sejak tahun pembuka). */
  yearIndex: number
  openingBalance: Prisma.Decimal
  depreciation: Prisma.Decimal
  closingBalance: Prisma.Decimal
  /** Snapshot beku saat baris dibuat (P4). */
  method: string
  groupCode: string
  ratePercent: Prisma.Decimal
  source: FiscalBalanceSource
}

export type FiscalBalanceRejection =
  | "metode-belum-dipilih"
  | "bangunan-saldo-menurun"
  | "metode-tidak-sah"
  | "tanpa-tanggal-perolehan"
  | "tahun-sebelum-mulai"
  | "saldo-pembuka-tidak-valid"

export interface BuildFiscalYearRowsInput {
  /** Harga perolehan fiskal (tanpa residu). */
  purchaseCost: Prisma.Decimal | number | string
  /** Metode fiskal tersimpan kategori; null = belum dipilih (P1). */
  fiscalMethod: string | null | undefined
  fiscalGroup: FiscalGroupRule
  /** Tanggal perolehan; tahun kalendernya = tahun mulai fiskal (P3). */
  purchaseDate: Date | null | undefined
  /** Tahun terakhir (inklusif) yang dibangun barisnya. */
  throughYear: number
  /**
   * Saldo pembuka rekonstruksi aset lama (P3): saldo fiskal pada AWAL
   * `openingYear`, berlabel `opening`. Tahun < openingYear tidak
   * dibangun (riwayat tidak dikarang). Tanpa ini, mulai dari
   * `purchaseCost` di tahun `purchaseDate`.
   */
  openingBalance?: Prisma.Decimal | number | string | null
  openingYear?: number | null
}

/**
 * Bangun baris tahun fiskal dari tahun mulai (atau tahun pembuka)
 * sampai `throughYear`. Null beralasan bila fiskal belum-dihitung;
 * jangan pernah mengganti null dengan garis lurus.
 */
export function buildFiscalYearRows(
  input: BuildFiscalYearRowsInput,
): { rows: FiscalYearRow[] } | { rows: null; reason: FiscalBalanceRejection } {
  if (input.fiscalMethod == null || input.fiscalMethod.trim() === "") {
    return { rows: null, reason: "metode-belum-dipilih" }
  }
  const method = input.fiscalMethod
  if (method === "declining_balance" && input.fiscalGroup.isBuilding) {
    return { rows: null, reason: "bangunan-saldo-menurun" }
  }
  if (!isFiscalMethodAllowed(method, input.fiscalGroup)) {
    return { rows: null, reason: "metode-tidak-sah" }
  }
  if (!input.purchaseDate) return { rows: null, reason: "tanpa-tanggal-perolehan" }

  const rate = fiscalAnnualRatePercent(method, input.fiscalGroup)
  if (rate == null) return { rows: null, reason: "metode-tidak-sah" }
  const ratePercent = new Prisma.Decimal(rate)
  const lifeYears = input.fiscalGroup.usefulLifeYears
  const startYear = input.purchaseDate.getUTCFullYear()

  const hasOpening = input.openingBalance != null && input.openingYear != null
  if (hasOpening && (input.openingYear! < startYear || dec(input.openingBalance!).lt(0))) {
    return { rows: null, reason: "saldo-pembuka-tidak-valid" }
  }
  const firstYear = hasOpening ? input.openingYear! : startYear
  // Indeks masa manfaat berjalan terus dari tahun mulai walau baris
  // dimulai dari saldo pembuka (tahun terakhir tetap tahun ke-lifeYears).
  const firstIndex = hasOpening ? input.openingYear! - startYear + 1 : 1

  let balance = sen(hasOpening ? dec(input.openingBalance!) : dec(input.purchaseCost))
  if (balance.lt(0)) balance = ZERO

  const rows: FiscalYearRow[] = []
  for (let taxYear = firstYear, yearIndex = firstIndex; taxYear <= input.throughYear; taxYear++, yearIndex++) {
    const opening = balance
    let depreciation: Prisma.Decimal
    if (opening.lte(0)) {
      depreciation = ZERO
    } else if (method === "straight_line") {
      depreciation = sen(dec(input.purchaseCost).mul(ratePercent).div(100))
    } else if (yearIndex >= lifeYears) {
      // Pasal 11 ayat (2): akhir masa manfaat disusutkan sekaligus.
      depreciation = opening
    } else {
      depreciation = sen(opening.mul(ratePercent).div(100))
    }
    if (depreciation.gt(opening)) depreciation = opening
    if (depreciation.lt(0)) depreciation = ZERO
    const closing = opening.sub(depreciation)
    rows.push({
      taxYear,
      yearIndex,
      openingBalance: opening,
      depreciation,
      closingBalance: closing,
      method,
      groupCode: input.fiscalGroup.code,
      ratePercent,
      source: hasOpening && taxYear === firstYear ? "opening" : "computed",
    })
    balance = closing
  }
  return { rows }
}

/**
 * Penyusutan fiskal satu tahun pajak untuk read-model (P5).
 * Baris tertutup (`closedRows`, dari tabel inti nanti) dipakai apa
 * adanya; tanpa baris untuk tahun itu = rekonstruksi builder berlabel
 * `estimasi-tahun-berjalan`. Null = belum-dihitung beralasan.
 */
export function fiscalDepreciationForYear(input: {
  purchaseCost: Prisma.Decimal | number | string
  fiscalMethod: string | null | undefined
  fiscalGroup: FiscalGroupRule
  purchaseDate: Date | null | undefined
  taxYear: number
  closedRows?: readonly FiscalYearRow[] | null
  openingBalance?: Prisma.Decimal | number | string | null
  openingYear?: number | null
}):
  | { depreciation: Prisma.Decimal; source: FiscalBalanceSource }
  | { depreciation: null; reason: FiscalBalanceRejection } {
  const closed = input.closedRows?.find((row) => row.taxYear === input.taxYear)
  if (closed) return { depreciation: closed.depreciation, source: closed.source }
  if (input.purchaseDate && input.taxYear < input.purchaseDate.getUTCFullYear()) {
    return { depreciation: null, reason: "tahun-sebelum-mulai" }
  }
  const built = buildFiscalYearRows({ ...input, throughYear: input.taxYear })
  if (built.rows === null) return { depreciation: null, reason: built.reason }
  const row = built.rows.find((r) => r.taxYear === input.taxYear)
  if (!row) return { depreciation: null, reason: "tahun-sebelum-mulai" }
  return { depreciation: row.depreciation, source: "estimasi-tahun-berjalan" }
}

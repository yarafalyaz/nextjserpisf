/**
 * Perbedaan temporer pajak tangguhan — tahap STOK (F-2026-10-23-112 tahap
 * pertama, vonis BOT 4 F-2026-10-23-112-V, PR #618) + konvergensi transisi
 * F-2026-10-23-124-V (vonis BOT 4, PR #646).
 *
 * Menghitung, per aset belum dilepas, perbedaan temporer antara nilai buku
 * komersial dan dasar fiskal TERBEKUKAN, lalu menghitung pajak tangguhan ATAS
 * STOK perbedaan itu pada tarif yang dipasok pemanggil.
 *
 * NILAI BUKU KOMERSIAL = nilai buku jurnal POSTED (`journalBookValue`, vonis
 * F-2026-10-22-062-V Putusan 1) yang dihitung loader — bukan cache
 * `Asset.currentValue` dan bukan beban tahun berjalan.
 *
 * DASAR FISKAL (F-124-V Putusan 1): WAJIB baris saldo fiskal terbekukan
 * `closingBalance` (kontrak builder inti F-109 `buildFiscalYearRows`,
 * src/lib/finance/asset-fiscal-balance.ts). Aset tanpa baris terbekukan =
 * `fiskal-belum-terbekukan`: selisih TIDAK dihitung (bukan nol, bukan garis
 * lurus pengganti). Fungsi karangan `assetTaxBaseAt` (garis lurus dari
 * `purchaseCost` berjalan) GUGUR tanpa fallback (E124-1/E124-4) — aset fiskal
 * saldo-menurun tidak lagi dihitung sebagai garis lurus. Loader hari ini
 * belum punya tabel baris tahun (inti F-109 belum dibangun), jadi ia
 * meneruskan `frozenClosingBalance: null` untuk semua aset dan laporan
 * tampil jujur belum-terbekukan, bukan angka karangan.
 *
 * TARIF (F-124-V Putusan 2): kelak hanya dari master tarif badan bertanggal
 * efektif (seed 22% sebagai data). Sampai master ada, pemanggil boleh pasok
 * tarif operator lewat `rateSource: "operator"` — builder menamainya
 * "tarif pasokan operator — bukan master" di caption, verdict, dan summary
 * (bukan hanya di kode). `rateSource: "master"` = tarif dari master
 * bertanggal efektif. Tarif tidak sah/tidak ada = fail-closed, nol hitung.
 *
 * Laporan ini READ-MODEL penjelasan: TIDAK PERNAH membuat jurnal, aset/
 * liabilitas tangguhan tidak disalinghapus di GL (Putusan 2 F-112-V), dan
 * jurnal hanya boleh lahir dari peristiwa Perhitungan Pajak Tangguhan
 * tahunan terbekukan (belum dibangun, gerbang kebijakan BOT 1).
 *
 * Pure (tanpa Prisma/DOM). Uang dibulatkan sekali per aset ke sen memakai
 * `src/lib/utils/math`, bukan float mentah ke kolom uang.
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeDivide, safeMultiply, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Label jujur yang wajib ditampilkan konsumen apa adanya (kontrak data). */
export const DEFERRED_TAX_NOTICE =
  "Read-model penjelasan pajak tangguhan tahap stok: perbedaan temporer ini bukan " +
  "bukti jurnal dan tidak boleh dipakai sebagai dasar jurnal. Jurnal pajak tangguhan " +
  "hanya boleh lahir dari peristiwa Perhitungan Pajak Tangguhan tahunan yang terbekukan, " +
  "dengan gerbang kebijakan yang sudah diputus dan tarif bertanggal efektif yang disnapshot " +
  "pada peristiwa itu."

/** Label tarif pasokan operator selama master bertanggal efektif belum ada (F-124-V Putusan 2). */
export const OPERATOR_RATE_LABEL = "tarif pasokan operator — bukan master"

/** Sumber tarif badan: `master` = master bertanggal efektif; `operator` = pasokan operator transisi. */
export type DeferredTaxRateSource = "master" | "operator"

/** Label dasar fiskal belum terbekukan (F-124-V Putusan 1). */
export const FISCAL_NOT_FROZEN_LABEL = "Fiskal belum terbekukan"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Aset", align: "left", width: 72 },
  { header: "Nilai Buku Komersial", align: "right", width: 42 },
  { header: "Dasar Fiskal", align: "right", width: 42 },
  { header: "Perbedaan Temporer", align: "right", width: 42 },
  { header: "Arah", align: "left", width: 34 },
  { header: "Tangguhan", align: "right", width: 35 },
]

export interface DeferredTaxAssetInput {
  code: string
  name: string
  categoryName: string | null
  /** Harga perolehan (harga perolehan pertama, bukan nilai buku). */
  purchaseCost: number
  /**
   * Nilai buku komersial wajib dasar jurnal POSTED (`journalBookValue`),
   * bukan cache `Asset.currentValue`.
   */
  bookValue: number
  /** Tanggal perolehan asli; null = aset legacy tanpa tanggal. */
  purchaseDate: Date | null
  /** Kelompok fiskal PMK 72/2023 terisi di kategori, atau null. */
  taxGroupCode: string | null
  /** Jenis tercantum di lampiran PMK 72/2023? null = belum dinyatakan. */
  taxTypeListed: boolean | null
  /** Ada penetapan DJP (mengalahkan default statutoris kelompok 3). */
  taxDjpDetermination: boolean
  /**
   * Aset legacy tanpa jurnal perolehan POSTED. Nilai buku komersialnya
   * tidak dapat dibuktikan dari jurnal, jadi aset ini TIDAK masuk
   * perbandingan (bukan diberi angka 0 yang terbaca "tidak berbeda").
   */
  hasPostedBooks: boolean
  /**
   * `closingBalance` baris saldo fiskal TERBEKUKAN untuk tahun pajak `asOf`
   * (kontrak F-109 `buildFiscalYearRows`). null/tidak diisi = belum ada baris
   * terbekukan: aset `fiskal-belum-terbekukan`, selisih TIDAK dihitung.
   * DILARANG mengisi dari hitung ulang `purchaseCost` berjalan.
   */
  frozenClosingBalance?: number | null
  /** Alasan belum-terbekukan dari resolver F-109 (mis. `metode-belum-dipilih`); tampil apa adanya. */
  frozenRejectionReason?: string | null
}

export type TemporaryDifferenceDirection = "liability" | "asset" | "none"

export interface DeferredTaxResult {
  /** Tarif badan yang dipakai (persen), sesudah validasi, atau null bila ditolak. */
  taxRatePercent: number | null
  /** Sumber tarif; null bila tarif ditolak/tidak dipasok. */
  rateSource: DeferredTaxRateSource | null
  /** Label tarif operator verbatim; null bila tarif dari master. */
  rateSourceLabel: string | null
  /** Tanggal akhir tahun pajak yang dipakai hitung fiskal kumulatif. */
  asOf: Date
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    assets: number
    /** Aset yang tidak masuk perbandingan (dasar tidak dapat dibuktikan). */
    excluded: number
    /** Aset tanpa baris saldo fiskal terbekukan (F-124-V Putusan 1). */
    fiscalNotFrozen: number
    /** Jumlah tercatat komersial agregat untuk aset yang dibandingkan. */
    carryingAmount: number
    /** Dasar fiskal agregat untuk aset yang dibandingkan. */
    taxBase: number
    /** Perbedaan temporer agregat bertanda (komersial − fiskal). */
    temporaryDifference: number
    /** Pajak tangguhan (positif) atas perbedaan kena pajak (liabilitas). */
    deferredTaxLiability: number
    /** Pajak tangguhan (positif) atas perbedaan dapat dikurangkan (aset). */
    deferredTaxAsset: number
  }
  verdict: string
  notice: string
}

export function validateTaxRatePercent(ratePercent: number | null | undefined): number | null {
  if (ratePercent === null || ratePercent === undefined) return null
  if (!Number.isFinite(ratePercent)) return null
  if (ratePercent <= 0 || ratePercent > 100) return null
  return ratePercent
}

function directionOf(difference: number): TemporaryDifferenceDirection {
  if (difference > 0) return "liability"
  if (difference < 0) return "asset"
  return "none"
}

function directionLabel(direction: TemporaryDifferenceDirection): string {
  if (direction === "liability") return "Kena pajak (liabilitas)"
  if (direction === "asset") return "Dapat dikurangkan (aset)"
  return "Tidak ada perbedaan"
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function rateCaption(rate: number, source: DeferredTaxRateSource): string {
  return source === "operator" ? `pada tarif ${rate}% (${OPERATOR_RATE_LABEL})` : `pada tarif master ${rate}%`
}

export function buildDeferredTaxTemporaryDifference(input: {
  assets: DeferredTaxAssetInput[]
  /** Tarif badan persen dari master bertanggal efektif; transisi: pasokan operator. */
  taxRatePercent: number | null
  /** Asal tarif; wajib eksplisit agar label transisi tidak hilang. Default `operator`. */
  rateSource?: DeferredTaxRateSource
  /** Tanggal akhir tahun pajak yang dinilai. */
  asOf: Date
}): DeferredTaxResult {
  const rate = validateTaxRatePercent(input.taxRatePercent)
  const source: DeferredTaxRateSource = input.rateSource ?? "operator"
  const notice = DEFERRED_TAX_NOTICE

  if (rate === null) {
    return {
      taxRatePercent: null,
      rateSource: null,
      rateSourceLabel: null,
      asOf: input.asOf,
      table: {
        columns: COLUMNS,
        rows: [
          {
            kind: "notice",
            text: "Tarif pajak badan tidak sah atau belum dipasok, sehingga pajak tangguhan tidak dihitung. " + notice,
          },
        ],
      },
      totals: {
        assets: input.assets.length,
        excluded: input.assets.length,
        fiscalNotFrozen: 0,
        carryingAmount: 0,
        taxBase: 0,
        temporaryDifference: 0,
        deferredTaxLiability: 0,
        deferredTaxAsset: 0,
      },
      verdict: "Pajak tangguhan tidak dihitung: tarif badan tidak sah",
      notice,
    }
  }

  const rateSourceLabel = source === "operator" ? OPERATOR_RATE_LABEL : null

  const sorted = [...input.assets].sort((a, b) => {
    const byCategory = (a.categoryName ?? "").localeCompare(b.categoryName ?? "", "id-ID")
    if (byCategory !== 0) return byCategory
    return `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "id-ID")
  })

  const totals: DeferredTaxResult["totals"] = {
    assets: sorted.length,
    excluded: 0,
    fiscalNotFrozen: 0,
    carryingAmount: 0,
    taxBase: 0,
    temporaryDifference: 0,
    deferredTaxLiability: 0,
    deferredTaxAsset: 0,
  }
  const rows: TableRow[] = []
  let currentCategory: string | null | undefined

  for (const asset of sorted) {
    const categoryName = asset.categoryName ?? "Tanpa kategori"
    if (categoryName !== currentCategory) {
      rows.push({ kind: "group", label: categoryName })
      currentCategory = categoryName
    }
    const label = asset.code ? `${asset.code} ${asset.name}` : asset.name
    if (!asset.hasPostedBooks) {
      totals.excluded += 1
      rows.push({
        kind: "data",
        cells: [label, "–", "–", "–", "Belum dapat dihitung", "–"],
      })
      continue
    }
    // F-124-V Putusan 1: dasar fiskal hanya dari baris terbekukan.
    const taxBase = asset.frozenClosingBalance ?? null
    if (taxBase === null || !Number.isFinite(taxBase)) {
      totals.excluded += 1
      totals.fiscalNotFrozen += 1
      const reason = asset.frozenRejectionReason?.trim()
      rows.push({
        kind: "data",
        cells: [
          label,
          amount(asset.bookValue),
          FISCAL_NOT_FROZEN_LABEL,
          "–",
          reason ? `${FISCAL_NOT_FROZEN_LABEL} (${reason})` : FISCAL_NOT_FROZEN_LABEL,
          "–",
        ],
      })
      continue
    }

    const difference = safeSubtract(asset.bookValue, taxBase, 2)
    const direction = directionOf(difference)
    const deferred = safeDivide(safeMultiply(Math.abs(difference), rate, 2), 100, 2)
    if (direction === "liability") {
      totals.deferredTaxLiability = safeAdd(totals.deferredTaxLiability, deferred, 2)
    } else if (direction === "asset") {
      totals.deferredTaxAsset = safeAdd(totals.deferredTaxAsset, deferred, 2)
    }
    totals.carryingAmount = safeAdd(totals.carryingAmount, asset.bookValue, 2)
    totals.taxBase = safeAdd(totals.taxBase, taxBase, 2)
    totals.temporaryDifference = safeAdd(totals.temporaryDifference, difference, 2)

    rows.push({
      kind: "data",
      cells: [
        label,
        amount(asset.bookValue),
        amount(taxBase),
        amount(difference),
        directionLabel(direction),
        amount(deferred),
      ],
    })
  }

  if (sorted.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada aset (selain yang sudah dilepas) untuk dinilai perbedaan temporernya.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        amount(totals.carryingAmount),
        amount(totals.taxBase),
        amount(totals.temporaryDifference),
        amount(safeAdd(totals.deferredTaxLiability, totals.deferredTaxAsset, 2)),
      ],
    })
    if (totals.excluded > 0) {
      rows.push({
        kind: "notice",
        text:
          `${totals.excluded} aset tidak masuk perbandingan (nilai buku jurnal POSTED tidak ada ` +
          `atau ${FISCAL_NOT_FROZEN_LABEL.toLowerCase()}), sehingga perbedaan temporernya tidak ` +
          "dihitung dan tidak ikut pada kolom Perbedaan Temporer.",
      })
    }
    if (rateSourceLabel) {
      rows.push({ kind: "notice", text: `Tarif ${rate}% adalah ${rateSourceLabel}.` })
    }
    rows.push({ kind: "notice", text: notice })
  }

  const verdict =
    sorted.length === 0
      ? "Tidak ada aset untuk dinilai"
      : totals.excluded === sorted.length
        ? totals.fiscalNotFrozen === sorted.length
          ? `${FISCAL_NOT_FROZEN_LABEL} untuk semua aset: perbedaan temporer belum dapat dihitung`
          : "Perbedaan temporer belum dapat dihitung untuk aset mana pun"
        : `Liabilitas tangguhan indikasi ${formatCurrency(totals.deferredTaxLiability)} · ` +
          `aset tangguhan indikasi ${formatCurrency(totals.deferredTaxAsset)} ` +
          `${rateCaption(rate, source)} (read-model, bukan jurnal)`

  return {
    taxRatePercent: rate,
    rateSource: source,
    rateSourceLabel,
    asOf: input.asOf,
    table: { columns: COLUMNS, rows },
    totals,
    verdict,
    notice,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function deferredTaxSummary(result: DeferredTaxResult): string {
  if (result.taxRatePercent === null) return "Pajak tangguhan tidak dihitung: tarif badan tidak sah"
  if (result.totals.assets === 0) return "Tidak ada aset untuk dinilai"
  if (result.totals.excluded === result.totals.assets) {
    if (result.totals.fiscalNotFrozen === result.totals.assets) {
      return `${FISCAL_NOT_FROZEN_LABEL} untuk semua aset: perbedaan temporer belum dapat dihitung`
    }
    return "Perbedaan temporer belum dapat dihitung untuk aset mana pun"
  }
  const sourceSuffix =
    result.rateSource === "operator" ? `, ${OPERATOR_RATE_LABEL}` : result.rateSource === "master" ? ", tarif master" : ""
  return (
    `Liabilitas tangguhan indikasi ${formatCurrency(result.totals.deferredTaxLiability)} · ` +
    `aset tangguhan indikasi ${formatCurrency(result.totals.deferredTaxAsset)} ` +
    `(tarif ${result.taxRatePercent}%${sourceSuffix}, read-model bukan jurnal)`
  )
}

/**
 * Perbedaan temporer pajak tangguhan — tahap STOK (F-2026-10-23-112 tahap pertama,
 * vonis BOT 4 F-2026-10-23-112-V, PR #618).
 *
 * Menghitung, per aset belum dilepas, perbedaan temporer antara nilai buku
 * komersial dan dasar fiskal, lalu menghitung pajak tangguhan ATAS STOK
 * perbedaan itu pada tarif yang dipasok pemanggil.
 *
 * NILAI BUKU KOMERSIAL = nilai buku jurnal POSTED (`journalBookValue`, vonis
 * F-2026-10-22-062-V Putusan 1) yang dihitung loader — bukan cache
 * `Asset.currentValue` dan bukan beban tahun berjalan. Dasar fiskal =
 * harga perolehan dikurangi penyusutan fiskal GARIS LURUS kumulatif memakai
 * kelompok statutoris PMK 72/2023 (`resolveFiscalGroup`) — pola yang sama
 * dengan laporan Perbedaan Penyusutan (`depreciation-difference.ts`), hanya
 * dikumulatifkan sampai tanggal akhir tahun pajak yang diminta, bukan beban
 * satu tahun. ponytail: saldo menurun fiskal butuh saldo fiskal awal tahun yang
 * tidak dilacak terpisah — jangan karang dari harga perolehan. Naikkan bila
 * saldo fiskal per aset sudah disimpan.
 *
 * Tarif badan TIDAK ditanam di sini: F-112-V Putusan 3 mewajibkan tarif
 * bertanggal efektif + snapshot peristiwa, dan gerbang kebijakan tangguhan
 * (Putusan gerbang) belum diputus BOT 1. Laporan ini karena itu adalah
 * READ-MODEL penjelasan: menghitung indikasi tangguhan dari tarif yang
 * dipasok pemanggil, dan menolak bekerja (fail-closed) bila tarif tidak
 * sah — TIDAK PERNAH membuat jurnal, aset/liabilitas tangguhan tidak
 * disalinghapus di GL (Putusan 2), dan jurnal hanya boleh lahir dari
 * peristiwa Perhitungan Pajak Tangguhan tahunan terbekukan (belum dibangun).
 *
 * Pure (tanpa Prisma/DOM). Uang dibulatkan sekali per asel ke sen memakai
 * `src/lib/utils/math`, bukan float mentah ke kolom uang.
 */

import {
  fiscalAnnualRatePercent,
  fiscalGroupRule,
  resolveFiscalGroup,
} from "@/lib/finance/asset-fiscal-groups"
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
}

export type TemporaryDifferenceDirection = "liability" | "asset" | "none"

export interface DeferredTaxResult {
  /** Tarif badan yang dipakai (persen), sesudah validasi, atau null bila ditolak. */
  taxRatePercent: number | null
  /** Tanggal akhir tahun pajak yang dipakai hitung fiskal kumulatif. */
  asOf: Date
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    assets: number
    /** Aset yang tidak masuk perbandingan (dasar tidak dapat dibuktikan). */
    excluded: number
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

/**
 * Dasar fiskal satu aset pada `asOf`: harga perolehan dikurangi penyusutan
 * fiskal garis lurus tahunan × tahun fiskal penuh yang sudah lewat sejak
 * tahun perolehan (tahun perolehan dihitung sebagai tahun pertama, sesuai
 * masa penyusutan Pasal 11 yang dimulai tahun perolehan), tidak pernah di
 * bawah nol. Null bila kelompok fiskal belum dapat ditentukan.
 */
export function assetTaxBaseAt(asset: DeferredTaxAssetInput, asOf: Date): number | null {
  const resolution = resolveFiscalGroup({
    taxGroupCode: asset.taxGroupCode,
    taxTypeListed: asset.taxTypeListed,
    taxDjpDetermination: asset.taxDjpDetermination,
  })
  if (resolution.status !== "resolved") return null
  const rule = fiscalGroupRule(resolution.group.code)
  if (!rule) return null
  const ratePercent = fiscalAnnualRatePercent("straight_line", rule)
  if (ratePercent === null) return null

  const start = asset.purchaseDate
  const yearsElapsed = start ? Math.max(0, asOf.getUTCFullYear() - start.getUTCFullYear() + 1) : 0
  const annual = safeDivide(safeMultiply(asset.purchaseCost, ratePercent, 2), 100, 2)
  const accumulated = safeMultiply(annual, yearsElapsed, 2)
  return Math.max(0, safeSubtract(asset.purchaseCost, accumulated, 2))
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

export function buildDeferredTaxTemporaryDifference(input: {
  assets: DeferredTaxAssetInput[]
  /** Tarif badan persen, wajib dipasok pemanggil dari master bertanggal efektif. */
  taxRatePercent: number | null
  /** Tanggal akhir tahun pajak yang dinilai. */
  asOf: Date
}): DeferredTaxResult {
  const rate = validateTaxRatePercent(input.taxRatePercent)
  const notice = DEFERRED_TAX_NOTICE

  if (rate === null) {
    return {
      taxRatePercent: null,
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

  const sorted = [...input.assets].sort((a, b) => {
    const byCategory = (a.categoryName ?? "").localeCompare(b.categoryName ?? "", "id-ID")
    if (byCategory !== 0) return byCategory
    return `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, "id-ID")
  })

  const totals: DeferredTaxResult["totals"] = {
    assets: sorted.length,
    excluded: 0,
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
    const taxBase = asset.hasPostedBooks ? assetTaxBaseAt(asset, input.asOf) : null
    if (taxBase === null) {
      totals.excluded += 1
      rows.push({
        kind: "data",
        cells: [
          asset.code ? `${asset.code} ${asset.name}` : asset.name,
          asset.hasPostedBooks ? amount(asset.bookValue) : "–",
          "–",
          "–",
          "Belum dapat dihitung",
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
        asset.code ? `${asset.code} ${asset.name}` : asset.name,
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
          "atau kelompok fiskal belum dapat ditentukan), sehingga perbedaan temporernya tidak " +
          "dihitung dan tidak ikut pada kolom Perbedaan Temporer.",
      })
    }
    rows.push({ kind: "notice", text: notice })
  }

  const verdict =
    sorted.length === 0
      ? "Tidak ada aset untuk dinilai"
      : totals.excluded === sorted.length
        ? "Perbedaan temporer belum dapat dihitung untuk aset mana pun"
        : `Liabilitas tangguhan indikasi ${formatCurrency(totals.deferredTaxLiability)} · ` +
          `aset tangguhan indikasi ${formatCurrency(totals.deferredTaxAsset)} ` +
          `pada tarif ${rate}% (read-model, bukan jurnal)`

  return { taxRatePercent: rate, asOf: input.asOf, table: { columns: COLUMNS, rows }, totals, verdict, notice }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function deferredTaxSummary(result: DeferredTaxResult): string {
  if (result.taxRatePercent === null) return "Pajak tangguhan tidak dihitung: tarif badan tidak sah"
  if (result.totals.assets === 0) return "Tidak ada aset untuk dinilai"
  if (result.totals.excluded === result.totals.assets) {
    return "Perbedaan temporer belum dapat dihitung untuk aset mana pun"
  }
  return (
    `Liabilitas tangguhan indikasi ${formatCurrency(result.totals.deferredTaxLiability)} · ` +
    `aset tangguhan indikasi ${formatCurrency(result.totals.deferredTaxAsset)} ` +
    `(tarif ${result.taxRatePercent}%, read-model bukan jurnal)`
  )
}

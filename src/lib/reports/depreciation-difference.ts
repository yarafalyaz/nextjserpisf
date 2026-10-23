/**
 * Perbedaan penyusutan — membandingkan penyusutan **akuntansi** (komersial)
 * dengan penyusutan **fiskal** (pajak) per aset, per tahun.
 *
 * Sisi akuntansi memakai mesin yang sama dengan cron penyusutan bulanan
 * (`computeMonthlyDepreciation`), lalu dikalikan dua belas; dasarnya nilai
 * buku JURNAL POSTED dari loader (`journalBookValue`, Putusan 1), bukan
 * cache `currentValue` — jadi angka di sini tidak bisa berbeda dari jurnal.
 *
 * Sisi fiskal garis lurus dari **harga perolehan** (bukan nilai buku) tanpa
 * nilai residu, tarif/umur dari kelompok fiskal PMK 72/2023 kategori
 * (`resolveFiscalGroup`, Putusan 2): jenis tercantum tanpa kelompok = tidak
 * dihitung dan tampil di daftar "fiskal belum dapat dihitung"; jenis tidak
 * tercantum tanpa kelompok = kelompok 3 statutoris TERHITUNG; penetapan DJP
 * mengalahkan default. Aset belum-dihitung dinyatakan, bukan diisi nol.
 *
 * Angka tahunan (bukan per periode berjalan): perbedaan penyusutan adalah
 * perbedaan temporer yang dibaca per tahun pajak.
 *
 * Pure (tanpa Prisma/DOM) kecuali `computeMonthlyDepreciation` yang juga pure.
 */

import {
  computeMonthlyDepreciation,
} from "@/lib/finance/asset-depreciation"
import {
  fiscalAnnualRatePercent,
  fiscalGroupRule,
  resolveFiscalGroup,
} from "@/lib/finance/asset-fiscal-groups"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeDivide, safeMultiply, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 262mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Aset", align: "left", width: 84 },
  { header: "Kategori", align: "left", width: 44 },
  { header: "Nilai Perolehan", align: "right", width: 38 },
  { header: "Akuntansi/thn", align: "right", width: 32 },
  { header: "Fiskal/thn", align: "right", width: 32 },
  { header: "Selisih", align: "right", width: 32 },
]

export interface DepreciationAssetInput {
  code: string
  name: string
  categoryName: string | null
  purchaseCost: number
  /**
   * Nilai buku SEBELUM periode ini — wajib dasar jurnal POSTED
   * (`journalBookValue`), bukan cache `Asset.currentValue` (Putusan 1).
   */
  bookValue: number
  residualValue: number
  depreciationMethod: string | null
  categoryDepreciationRate: number | null
  categoryUsefulLife: number | null
  taxDepreciationRate: number | null
  taxUsefulLife: number | null
  /** Kelompok fiskal PMK 72/2023 terisi di kategori, atau null. */
  taxGroupCode: string | null
  /** Jenis tercantum di lampiran PMK 72/2023? null = belum dinyatakan. */
  taxTypeListed: boolean | null
  /** Ada penetapan DJP (mengalahkan default statutoris kelompok 3). */
  taxDjpDetermination: boolean
}

export interface DepreciationDifferenceResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    assets: number
    /** Aset yang penyusutan fiskalnya belum bisa dihitung. */
    withoutFiscal: number
    accountingAnnual: number
    /** Σ fiskal, hanya untuk aset yang punya konfigurasi fiskal. */
    fiscalAnnual: number
    /** Σ akuntansi untuk aset yang sama dengan `fiscalAnnual` (apel-ke-apel). */
    accountingComparable: number
    /** accountingComparable − fiscalAnnual. */
    difference: number
  }
  verdict: string
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function assetLabel(asset: DepreciationAssetInput): string {
  return asset.code ? `${asset.code} ${asset.name}` : asset.name
}

/** Penyusutan akuntansi setahun penuh (12 × penyusutan bulanan). */
export function accountingAnnualDepreciation(asset: DepreciationAssetInput): number {
  const monthly = computeMonthlyDepreciation({
    purchaseCost: asset.purchaseCost,
    bookValue: asset.bookValue,
    residualValue: asset.residualValue,
    depreciationMethod: asset.depreciationMethod,
    categoryDepreciationRate: asset.categoryDepreciationRate,
    categoryUsefulLife: asset.categoryUsefulLife,
  })
  if (monthly.status !== "computed") return 0
  return safeMultiply(monthly.amount.toNumber(), 12, 2)
}

/**
 * Penyusutan fiskal setahun penuh, atau `null` bila kelompok fiskal belum
 * dapat ditentukan (vonis F-2026-10-22-062-V Putusan 2, F62-7/F62-10).
 * Kelompok fiskal efektif dari `resolveFiscalGroup` — jenis tercantum
 * tanpa kelompok = belum-dihitung; jenis tidak tercantum tanpa kelompok =
 * kelompok 3 statutoris TERHITUNG; penetapan DJP dengan kelompok terisi
 * mengalahkan default. Tarif dari tabel statutoris kelompok (bukan kolom
 * tarif bebas kategori; kolom bebas itu hanya divalidasi terhadapnya).
 * Fiskal dari harga perolehan tanpa residu; bangunan hanya garis lurus.
 */
export function fiscalAnnualDepreciation(asset: DepreciationAssetInput): number | null {
  const resolution = resolveFiscalGroup({
    taxGroupCode: asset.taxGroupCode,
    taxTypeListed: asset.taxTypeListed,
    taxDjpDetermination: asset.taxDjpDetermination,
  })
  if (resolution.status !== "resolved") return null

  const rule = resolution.group
  // ponytail: fiskal tahunan read-model ini selalu garis lurus statutoris
  // kelompok; saldo menurun fiskal butuh saldo fiskal awal tahun yang tidak
  // dilacak terpisah — jangan karang dari harga perolehan. Naikkan bila
  // saldo fiskal per aset sudah disimpan.
  const ratePercent = fiscalAnnualRatePercent("straight_line", rule)
  if (ratePercent === null) return null

  // Tahunan dihitung LANGSUNG dari harga perolehan x tarif statutoris dan
  // dibulatkan sekali ke sen. Jangan lewat penyusutan bulanan x12: bulanan
  // dibulatkan ke sen dulu (mis. 0,025 -> 0,03) sehingga tahunan meleset.
  return safeDivide(safeMultiply(asset.purchaseCost, ratePercent, 2), 100, 2)
}

/** Kelompok fiskal efektif (untuk label laporan); null = belum dapat dihitung. */
export function fiscalGroupLabel(asset: DepreciationAssetInput): string | null {
  const resolution = resolveFiscalGroup({
    taxGroupCode: asset.taxGroupCode,
    taxTypeListed: asset.taxTypeListed,
    taxDjpDetermination: asset.taxDjpDetermination,
  })
  if (resolution.status !== "resolved") return null
  const rule = fiscalGroupRule(resolution.group.code)
  if (!rule) return null
  const suffix =
    resolution.source === "statutory-default"
      ? " (default statutoris)"
      : resolution.source === "djp"
        ? " (penetapan DJP)"
        : ""
  return `${rule.label}${suffix}`
}

export function buildDepreciationDifference(
  assets: DepreciationAssetInput[],
): DepreciationDifferenceResult {
  const sorted = [...assets].sort((a, b) => {
    const byCategory = (a.categoryName ?? "").localeCompare(b.categoryName ?? "", "id-ID")
    if (byCategory !== 0) return byCategory
    return assetLabel(a).localeCompare(assetLabel(b), "id-ID")
  })

  const totals: DepreciationDifferenceResult["totals"] = {
    assets: sorted.length,
    withoutFiscal: 0,
    accountingAnnual: 0,
    fiscalAnnual: 0,
    accountingComparable: 0,
    difference: 0,
  }

  const rows: TableRow[] = []
  let currentCategory: string | null | undefined

  for (const asset of sorted) {
    const accounting = accountingAnnualDepreciation(asset)
    const fiscal = fiscalAnnualDepreciation(asset)
    const categoryName = asset.categoryName ?? "Tanpa kategori"

    if (categoryName !== currentCategory) {
      rows.push({ kind: "group", label: categoryName })
      currentCategory = categoryName
    }

    totals.accountingAnnual = safeAdd(totals.accountingAnnual, accounting, 2)
    if (fiscal === null) {
      totals.withoutFiscal += 1
    } else {
      totals.fiscalAnnual = safeAdd(totals.fiscalAnnual, fiscal, 2)
      totals.accountingComparable = safeAdd(totals.accountingComparable, accounting, 2)
      totals.difference = safeAdd(totals.difference, safeSubtract(accounting, fiscal, 2), 2)
    }

    rows.push({
      kind: "data",
      cells: [
        assetLabel(asset),
        categoryName,
        amount(asset.purchaseCost),
        amount(accounting),
        fiscal === null ? "–" : amount(fiscal),
        fiscal === null ? "–" : amount(accounting - fiscal),
      ],
    })
  }

  if (sorted.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada aset (selain yang sudah dilepas) untuk dihitung penyusutannya.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        "",
        amount(totals.accountingAnnual),
        amount(totals.fiscalAnnual),
        amount(totals.difference),
      ],
    })
    if (totals.withoutFiscal > 0) {
      rows.push({
        kind: "notice",
        text:
          `${totals.withoutFiscal} aset belum dapat dihitung fiskalnya (kelompok fiskal PMK 72/2023 belum ditentukan pada kategori, jenis tercantum tanpa kelompok), sehingga ` +
          "penyusutan fiskalnya tidak dihitung dan tidak ikut pada kolom Selisih. Tentukan " +
          "kelompok fiskal di master kategori aset; jenis TIDAK tercantum otomatis memakai kelompok 3 statutoris.",
      })
    }
    rows.push({
      kind: "notice",
      text:
        "Selisih = penyusutan akuntansi − fiskal (per tahun). Penyusutan akuntansi memakai mesin " +
        "yang sama dengan jurnal penyusutan bulanan; fiskal dihitung garis lurus dari harga " +
        "perolehan tanpa nilai residu. Total Selisih hanya mencakup aset yang fiskalnya terisi " +
        "(apel-ke-apel), bukan seluruh kolom akuntansi.",
    })
  }

  const verdict =
    sorted.length === 0
      ? "Tidak ada aset untuk dinilai"
      : totals.withoutFiscal === sorted.length
        ? "Penyusutan fiskal belum dapat dihitung untuk aset mana pun"
        : `Selisih penyusutan tahunan ${formatCurrency(totals.difference)}` +
          (totals.withoutFiscal > 0 ? ` · ${totals.withoutFiscal} aset belum dapat dihitung fiskal` : "")

  return { table: { columns: COLUMNS, rows }, totals, verdict }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function depreciationDifferenceSummary(result: DepreciationDifferenceResult): string {
  if (result.totals.assets === 0) return "Tidak ada aset untuk dinilai"
  if (result.totals.withoutFiscal === result.totals.assets) {
    return "Penyusutan fiskal belum dapat dihitung untuk aset mana pun"
  }
  return (
    `Akuntansi ${formatCurrency(result.totals.accountingComparable)} vs fiskal ` +
    `${formatCurrency(result.totals.fiscalAnnual)} · selisih ${formatCurrency(result.totals.difference)}` +
    (result.totals.withoutFiscal > 0 ? ` · ${result.totals.withoutFiscal} aset belum dapat dihitung fiskal` : "")
  )
}

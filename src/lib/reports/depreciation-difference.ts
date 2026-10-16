/**
 * Perbedaan penyusutan — membandingkan penyusutan **akuntansi** (komersial)
 * dengan penyusutan **fiskal** (pajak) per aset, per tahun.
 *
 * Sisi akuntansi memakai mesin yang sama dengan cron penyusutan bulanan
 * (`computeMonthlyDepreciation`), lalu dikalikan dua belas; jadi angka di sini
 * tidak bisa berbeda dari jurnal penyusutan yang benar-benar diposting.
 *
 * Sisi fiskal straight-line dari **harga perolehan** (bukan nilai buku) dan tanpa
 * nilai residu komersial, sesuai kebiasaan fiskal; tarif/umur fiskal diambil dari
 * kategori aset. Bila kategori belum diisi tarif/umur fiskal, aset tetap
 * ditampilkan tetapi **tidak** dihitung selisihnya — nilai yang dibiarkan kosong
 * dinyatakan, bukan diisi nol yang terbaca "tidak ada perbedaan".
 *
 * Angka tahunan (bukan per periode berjalan): perbedaan penyusutan adalah
 * perbedaan temporer yang dibaca per tahun pajak.
 *
 * Pure (tanpa Prisma/DOM) kecuali `computeMonthlyDepreciation` yang juga pure.
 */

import { computeMonthlyDepreciation } from "@/lib/finance/asset-depreciation"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
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
  currentValue: number
  residualValue: number
  depreciationMethod: string | null
  categoryDepreciationRate: number | null
  categoryUsefulLife: number | null
  taxDepreciationRate: number | null
  taxUsefulLife: number | null
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
    currentValue: asset.currentValue,
    residualValue: asset.residualValue,
    depreciationMethod: asset.depreciationMethod,
    categoryDepreciationRate: asset.categoryDepreciationRate,
    categoryUsefulLife: asset.categoryUsefulLife,
  })
  return monthly * 12
}

/**
 * Penyusutan fiskal setahun penuh, atau `null` bila tarif/umur fiskal belum
 * diisi (dibedakan dari 0 yang berarti "memang tidak disusutkan").
 */
export function fiscalAnnualDepreciation(asset: DepreciationAssetInput): number | null {
  const hasRate = asset.taxDepreciationRate !== null && asset.taxDepreciationRate > 0
  const hasLife = asset.taxUsefulLife !== null && asset.taxUsefulLife > 0
  if (!hasRate && !hasLife) return null

  const monthly = computeMonthlyDepreciation({
    purchaseCost: asset.purchaseCost,
    // Fiskal dihitung dari harga perolehan, bukan nilai buku berjalan.
    currentValue: asset.purchaseCost,
    residualValue: 0,
    depreciationMethod: "straight_line",
    categoryDepreciationRate: hasRate ? asset.taxDepreciationRate : null,
    categoryUsefulLife: hasLife ? asset.taxUsefulLife : null,
  })
  return monthly * 12
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

    totals.accountingAnnual += accounting
    if (fiscal === null) {
      totals.withoutFiscal += 1
    } else {
      totals.fiscalAnnual += fiscal
      totals.accountingComparable += accounting
      totals.difference += accounting - fiscal
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
          `${totals.withoutFiscal} aset belum diisi tarif/umur fiskal pada kategorinya, sehingga ` +
          "penyusutan fiskalnya tidak dihitung dan tidak ikut pada kolom Selisih. Isi bagian " +
          "\"Penyusutan Fiskal\" di master kategori aset untuk melengkapinya.",
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
        ? "Penyusutan fiskal belum diisi untuk aset mana pun"
        : `Selisih penyusutan tahunan ${formatCurrency(totals.difference)}` +
          (totals.withoutFiscal > 0 ? ` · ${totals.withoutFiscal} aset belum diisi fiskal` : "")

  return { table: { columns: COLUMNS, rows }, totals, verdict }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function depreciationDifferenceSummary(result: DepreciationDifferenceResult): string {
  if (result.totals.assets === 0) return "Tidak ada aset untuk dinilai"
  if (result.totals.withoutFiscal === result.totals.assets) {
    return "Penyusutan fiskal belum diisi untuk aset mana pun"
  }
  return (
    `Akuntansi ${formatCurrency(result.totals.accountingComparable)} vs fiskal ` +
    `${formatCurrency(result.totals.fiscalAnnual)} · selisih ${formatCurrency(result.totals.difference)}` +
    (result.totals.withoutFiscal > 0 ? ` · ${result.totals.withoutFiscal} aset belum diisi fiskal` : "")
  )
}

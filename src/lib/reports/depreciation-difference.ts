/**
 * Perbedaan penyusutan — membandingkan penyusutan **akuntansi** (komersial)
 * dengan penyusutan **fiskal** (pajak) per aset, per tahun pajak berjalan.
 *
 * Sisi akuntansi memakai mesin yang sama dengan cron penyusutan bulanan
 * (`computeMonthlyDepreciation`), lalu dikalikan dua belas; dasarnya nilai
 * buku JURNAL POSTED dari loader (`journalBookValue`, Putusan 1), bukan
 * cache `currentValue` — jadi angka di sini tidak bisa berbeda dari jurnal.
 *
 * Sisi fiskal membaca METODE FISKAL TERSIMPAN kategori (`fiscalMethod`,
 * vonis BOT 4 F-2026-10-23-109-V P1/P5) lewat builder inti
 * `fiscalDepreciationForYear`: baris tahun terbekukan dipakai apa adanya,
 * tanpa baris = rekonstruksi builder berlabel `estimasi-tahun-berjalan`.
 * `fiscalMethod` NULL = belum-dihitung (DILARANG fallback garis lurus);
 * bangunan saldo-menurun dan tanpa `purchaseDate` juga belum-dihitung
 * beralasan terstruktur (`fiscalRejectionReason`). Kelompok dari
 * `resolveFiscalGroup` (F-062-V Putusan 2): jenis tercantum tanpa
 * kelompok = tidak dihitung; jenis tidak tercantum tanpa kelompok =
 * kelompok 3 statutoris TERHITUNG; penetapan DJP mengalahkan default.
 * Aset belum-dihitung dinyatakan, bukan diisi nol.
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
  fiscalDepreciationForYear,
  type FiscalBalanceRejection,
  type FiscalBalanceSource,
  type FiscalYearRow,
} from "@/lib/finance/asset-fiscal-balance"
import {
  fiscalGroupRule,
  resolveFiscalGroup,
} from "@/lib/finance/asset-fiscal-groups"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeMultiply, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 262mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Aset", align: "left", width: 62 },
  { header: "Kategori", align: "left", width: 32 },
  { header: "Nilai Perolehan", align: "right", width: 34 },
  { header: "Akuntansi/thn", align: "right", width: 30 },
  { header: "Fiskal/thn", align: "right", width: 30 },
  { header: "Selisih", align: "right", width: 28 },
  { header: "Metode Fiskal", align: "left", width: 24 },
  { header: "Status Fiskal", align: "left", width: 22 },
]

/** Label tampilan metode fiskal tersimpan (F-109-V: UI tampil apa adanya). */
export function fiscalMethodLabel(fiscalMethod?: string | null): string {
  if (fiscalMethod === "straight_line") return "Garis lurus"
  if (fiscalMethod === "declining_balance") return "Saldo menurun"
  if (fiscalMethod == null || fiscalMethod.trim() === "") return "Belum dipilih"
  return fiscalMethod
}

/** Label tampilan sumber angka fiskal terhitung (vonis P5 verbatim estimasi). */
export function fiscalSourceLabel(source: FiscalBalanceSource): string {
  if (source === "estimasi-tahun-berjalan") return "estimasi-tahun-berjalan"
  if (source === "opening") return "Saldo pembuka"
  return "Terbekukan"
}

/** Label tampilan alasan fiskal belum-dihitung (kode backend apa adanya). */
export function fiscalRejectionLabel(
  reason: FiscalBalanceRejection | "kelompok-belum-ditentukan",
): string {
  switch (reason) {
    case "metode-belum-dipilih":
      return "Metode fiskal belum dipilih"
    case "bangunan-saldo-menurun":
      return "Bangunan hanya garis lurus"
    case "metode-tidak-sah":
      return "Metode fiskal tidak sah"
    case "tanpa-tanggal-perolehan":
      return "Tanpa tanggal perolehan"
    case "tahun-sebelum-mulai":
      return "Tahun sebelum mulai fiskal"
    case "saldo-pembuka-tidak-valid":
      return "Saldo pembuka tidak valid"
    case "kelompok-belum-ditentukan":
      return "Kelompok fiskal belum ditentukan"
  }
}

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
  /**
   * Metode fiskal tersimpan kategori (F-109-V P1); null/undefined = belum
   * dipilih -> fiskal belum-dihitung. Opsional di tipe supaya pemanggil
   * lama tanpa kolom ini tetap jujur belum-dihitung, bukan garis lurus.
   */
  fiscalMethod?: string | null
  /** Tanggal perolehan; tahun kalendernya = tahun mulai fiskal (P3). */
  purchaseDate?: Date | null
  /** Baris tahun saldo fiskal terbekukan aset ini (P4); dipakai apa adanya. */
  fiscalYearRows?: readonly FiscalYearRow[] | null
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

export interface FiscalAnnualResult {
  amount: number
  /** Sumber angka: baris terbekukan apa adanya, atau estimasi tahun berjalan. */
  source: FiscalBalanceSource
}

/**
 * Penyusutan fiskal tahun pajak `taxYear`, atau `null` bila belum dapat
 * dihitung (vonis F-2026-10-23-109-V P5, mengganti asumsi garis lurus
 * PR #602). Metode = `fiscalMethod` tersimpan kategori: NULL -> null
 * (belum-dihitung, lihat `fiscalRejectionReason`); saldo menurun membaca
 * saldo awal tahun dari baris terbekukan / rekonstruksi builder — tidak
 * pernah diganti garis lurus. Kelompok efektif dari `resolveFiscalGroup`.
 */
export function fiscalAnnualDepreciation(
  asset: DepreciationAssetInput,
  taxYear?: number,
): number | null {
  return fiscalAnnualDepreciationDetail(asset, taxYear)?.amount ?? null
}

export function fiscalAnnualDepreciationDetail(
  asset: DepreciationAssetInput,
  taxYear?: number,
): FiscalAnnualResult | null {
  const resolution = resolveFiscalGroup({
    taxGroupCode: asset.taxGroupCode,
    taxTypeListed: asset.taxTypeListed,
    taxDjpDetermination: asset.taxDjpDetermination,
  })
  if (resolution.status !== "resolved") return null
  const result = fiscalDepreciationForYear({
    purchaseCost: asset.purchaseCost,
    fiscalMethod: asset.fiscalMethod ?? null,
    fiscalGroup: resolution.group,
    purchaseDate: asset.purchaseDate ?? null,
    taxYear: taxYear ?? new Date().getFullYear(),
    closedRows: asset.fiscalYearRows ?? null,
  })
  if (result.depreciation === null) return null
  return { amount: result.depreciation.toNumber(), source: result.source }
}

/** Alasan terstruktur fiskal belum-dihitung (F-109-V P5); null = terhitung. */
export function fiscalRejectionReason(
  asset: DepreciationAssetInput,
  taxYear?: number,
): FiscalBalanceRejection | "kelompok-belum-ditentukan" | null {
  const resolution = resolveFiscalGroup({
    taxGroupCode: asset.taxGroupCode,
    taxTypeListed: asset.taxTypeListed,
    taxDjpDetermination: asset.taxDjpDetermination,
  })
  if (resolution.status !== "resolved") return "kelompok-belum-ditentukan"
  const result = fiscalDepreciationForYear({
    purchaseCost: asset.purchaseCost,
    fiscalMethod: asset.fiscalMethod ?? null,
    fiscalGroup: resolution.group,
    purchaseDate: asset.purchaseDate ?? null,
    taxYear: taxYear ?? new Date().getFullYear(),
    closedRows: asset.fiscalYearRows ?? null,
  })
  return result.depreciation === null ? result.reason : null
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
  taxYear: number = new Date().getFullYear(),
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
  let hasEstimate = false

  for (const asset of sorted) {
    const accounting = accountingAnnualDepreciation(asset)
    const fiscalDetail = fiscalAnnualDepreciationDetail(asset, taxYear)
    const fiscal = fiscalDetail?.amount ?? null
    if (fiscalDetail?.source === "estimasi-tahun-berjalan") hasEstimate = true
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
        fiscalMethodLabel(asset.fiscalMethod),
        fiscalDetail
          ? fiscalSourceLabel(fiscalDetail.source)
          : fiscalRejectionLabel(fiscalRejectionReason(asset, taxYear) ?? "kelompok-belum-ditentukan"),
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
        "",
        "",
      ],
    })
    if (totals.withoutFiscal > 0) {
      rows.push({
        kind: "notice",
        text:
          `${totals.withoutFiscal} aset belum dapat dihitung fiskalnya (metode fiskal belum dipilih, kelompok fiskal PMK 72/2023 belum ditentukan pada kategori, bangunan saldo menurun, atau tanpa tanggal perolehan), sehingga ` +
          "penyusutan fiskalnya tidak dihitung dan tidak ikut pada kolom Selisih. Tentukan " +
          "metode dan kelompok fiskal di master kategori aset; jenis TIDAK tercantum otomatis memakai kelompok 3 statutoris.",
      })
    }
    if (hasEstimate) {
      rows.push({
        kind: "notice",
        text:
          "Sebagian angka fiskal berlabel estimasi-tahun-berjalan: baris tahun fiskal aset itu belum ditutup/dibekukan, angka direkonstruksi dari saldo fiskal berjalan dan dapat berubah saat baris tahun dibuat.",
      })
    }
    rows.push({
      kind: "notice",
      text:
        "Selisih = penyusutan akuntansi − fiskal (per tahun). Penyusutan akuntansi memakai mesin " +
        "yang sama dengan jurnal penyusutan bulanan; fiskal memakai metode fiskal tersimpan kategori " +
        "dari harga perolehan tanpa nilai residu (saldo menurun dari saldo fiskal awal tahun). Total Selisih hanya mencakup aset yang fiskalnya terisi " +
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

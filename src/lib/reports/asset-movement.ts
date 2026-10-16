/**
 * Mutasi aset tetap — laporan pergerakan nilai aset untuk satu periode, disusun
 * seperti asset movement statement (SAP "asset history sheet", Dynamics 365
 * "Fixed asset movements", Accurate "Perubahan Aset Tetap"): satu blok vertikal
 * per jenis pergerakan, masing-masing dengan tripel Harga Perolehan / Akumulasi
 * Penyusutan / Nilai Buku.
 *
 *   SALDO AWAL → PENAMBAHAN → PENYUSUTAN → PELEPASAN → SALDO AKHIR
 *
 * Kolomnya bertie-out: Saldo Awal + Penambahan + Penyusutan + Pelepasan harus
 * sama dengan Saldo Akhir. Hasilnya diperiksa, dan bila tidak menutup laporan
 * menambahkan catatan — menyajikan neraca pergerakan yang "sepertinya" seimbang
 * karena dibulatkan adalah cara paling halus untuk menyembunyikan selisih.
 *
 * Pure (tanpa Prisma/DOM) supaya perhitungan saldo awal/akhir bisa diuji.
 */

import { formatAccounting } from "@/lib/utils/format"
import {
  accumulatedDepreciationByAsset,
  categoryLabelOf,
  disposalDateByAsset,
  isOnBookAt,
  DEPRECIATION_TYPE,
  type AssetLedgerAsset,
  type AssetLedgerEntry,
} from "@/lib/reports/asset-ledger"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — A4 mendatar (area isi 267mm). */
const COLUMNS: TableColumn[] = [
  { header: "Kategori / Aset", align: "left", width: 90 },
  { header: "Harga Perolehan", align: "right", width: 60 },
  { header: "Akum. Penyusutan", align: "right", width: 60 },
  { header: "Nilai Buku", align: "right", width: 57 },
]

/** Sel kosong pada kolom yang tidak relevan untuk baris itu. */
const EMPTY = "–"

export interface AssetMovementInput {
  assets: AssetLedgerAsset[]
  /** Seluruh riwayat aset (penyusutan + pelepasan). */
  entries: AssetLedgerEntry[]
  /** Awal periode (inelusif). */
  start: Date
  /** Akhir periode (inklusif). */
  end: Date
}

export interface AssetMovementTotals {
  cost: number
  accumulated: number
  bookValue: number
}

export interface AssetMovementResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  opening: AssetMovementTotals
  additions: AssetMovementTotals
  depreciation: AssetMovementTotals
  disposals: AssetMovementTotals
  closing: AssetMovementTotals
  /** Saldo akhir menurut pergerakan = saldo akhir menurut data. */
  isTiedOut: boolean
  /** Jumlah aset yang dilepas pada periode ini. */
  disposalCount: number
}

function emptyTotals(): AssetMovementTotals {
  return { cost: 0, accumulated: 0, bookValue: 0 }
}

function addTo(target: AssetMovementTotals, cost: number, accumulated: number) {
  target.cost += cost
  target.accumulated += accumulated
  target.bookValue += cost - accumulated
}

/** Baris angka untuk tripel (cost, accumulated, bookValue). */
function cellsOf(cost: number, accumulated: number, bookValue: number): string[] {
  return [amount(cost), amount(accumulated), amount(bookValue)]
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

/**
 * Pergerakan aset periode [start, end]. Saldo awal dihitung pada akhir hari
 * sebelum periode: aset yang sudah diperoleh dan belum dilepas saat itu.
 */
export function buildAssetMovement(input: AssetMovementInput): AssetMovementResult {
  const { assets, entries, start, end } = input
  // Akhir hari sebelum periode — supaya aset yang dilepas tepat di hari pertama
  // periode tidak ikut terhitung sebagai saldo awal.
  const beforeStart = new Date(start.getTime() - 1)

  const accumulatedToDate = accumulatedDepreciationByAsset(entries, end)
  const accumulatedBefore = accumulatedDepreciationByAsset(entries, beforeStart)
  const disposalDates = disposalDateByAsset(entries)

  const categoryOf = new Map(assets.map((asset) => [asset.id, categoryLabelOf(asset)]))

  const rows: TableRow[] = []

  // ── Saldo awal: per kategori ────────────────────────────────────────────────
  const opening = emptyTotals()
  const openingByCategory = new Map<string, AssetMovementTotals>()

  for (const asset of assets) {
    if (!isOnBookAt(asset, disposalDates.get(asset.id), beforeStart)) continue
    const category = categoryOf.get(asset.id) ?? ""
    const bucket = openingByCategory.get(category) ?? emptyTotals()
    addTo(bucket, Number(asset.purchaseCost), accumulatedBefore.get(asset.id) ?? 0)
    openingByCategory.set(category, bucket)
  }

  rows.push({ kind: "group", label: "Saldo Awal" })
  for (const category of [...openingByCategory.keys()].sort(sortId)) {
    const bucket = openingByCategory.get(category) ?? emptyTotals()
    addTo(opening, bucket.cost, bucket.accumulated)
    rows.push({ kind: "data", cells: [category, ...cellsOf(bucket.cost, bucket.accumulated, bucket.bookValue)] })
  }
  rows.push({
    kind: "total",
    label: "Jumlah Saldo Awal",
    cells: cellsOf(opening.cost, opening.accumulated, opening.bookValue),
  })

  // ── Penambahan: per aset yang diperoleh dalam periode ──────────────────────
  const additions = emptyTotals()
  rows.push({ kind: "group", label: "Penambahan" })

  const additionsInPeriod = assets
    .filter(
      (asset) =>
        asset.purchaseDate &&
        asset.purchaseDate.getTime() >= start.getTime() &&
        asset.purchaseDate.getTime() <= end.getTime(),
    )
    .sort(byCode)

  for (const asset of additionsInPeriod) {
    const cost = Number(asset.purchaseCost)
    // Aset baru belum punya akumulasi penyusutan pada saat perolehannya.
    addTo(additions, cost, 0)
    rows.push({
      kind: "data",
      cells: [`${asset.code} ${asset.name}`, amount(cost), EMPTY, amount(cost)],
    })
  }
  rows.push({
    kind: "total",
    label: "Jumlah Penambahan",
    cells: cellsOf(additions.cost, additions.accumulated, additions.bookValue),
  })

  // ── Penyusutan periode: per kategori ───────────────────────────────────────
  const depreciation = emptyTotals()
  const depreciationByCategory = new Map<string, number>()

  for (const entry of entries) {
    if (entry.type !== DEPRECIATION_TYPE) continue
    if (entry.date.getTime() < start.getTime() || entry.date.getTime() > end.getTime()) continue
    const category = categoryOf.get(entry.assetId)
    if (!category) continue
    depreciationByCategory.set(category, (depreciationByCategory.get(category) ?? 0) + Number(entry.amount))
  }

  rows.push({ kind: "group", label: "Penyusutan Periode Ini" })
  for (const category of [...depreciationByCategory.keys()].sort(sortId)) {
    const charge = depreciationByCategory.get(category) ?? 0
    // Beban menambah akumulasi dan mengurangi nilai buku.
    addTo(depreciation, 0, charge)
    rows.push({ kind: "data", cells: [category, EMPTY, amount(charge), amount(-charge)] })
  }
  rows.push({
    kind: "total",
    label: "Jumlah Penyusutan",
    cells: [EMPTY, amount(depreciation.accumulated), amount(depreciation.bookValue)],
  })

  // ── Pelepasan: per aset yang dilepas dalam periode ─────────────────────────
  const disposals = emptyTotals()
  rows.push({ kind: "group", label: "Pelepasan" })

  const disposalsInPeriod = assets
    .filter((asset) => {
      const date = disposalDates.get(asset.id)
      return Boolean(date) && (date as Date).getTime() >= start.getTime() && (date as Date).getTime() <= end.getTime()
    })
    .sort(byCode)

  for (const asset of disposalsInPeriod) {
    const cost = Number(asset.purchaseCost)
    // Akumulasi saat pelepasan = akumulasi sampai akhir periode (tidak ada
    // penyusutan setelah pelepasan, jadi angka ini = saat tanggal pelepasan).
    const accumulated = accumulatedToDate.get(asset.id) ?? accumulatedBefore.get(asset.id) ?? 0
    // Nilai yang keluar dari buku ditampilkan negatif.
    addTo(disposals, -cost, -accumulated)
    rows.push({
      kind: "data",
      cells: [`${asset.code} ${asset.name}`, amount(-cost), amount(-accumulated), amount(-(cost - accumulated))],
    })
  }
  rows.push({
    kind: "total",
    label: "Jumlah Pelepasan",
    cells: cellsOf(disposals.cost, disposals.accumulated, disposals.bookValue),
  })

  // ── Saldo akhir: hasil pergerakan, diperiksa terhadap data ─────────────────
  const closing: AssetMovementTotals = {
    cost: opening.cost + additions.cost + depreciation.cost + disposals.cost,
    accumulated: opening.accumulated + additions.accumulated + depreciation.accumulated + disposals.accumulated,
    bookValue: opening.bookValue + additions.bookValue + depreciation.bookValue + disposals.bookValue,
  }

  const closingByData = emptyTotals()
  const closingByCategory = new Map<string, AssetMovementTotals>()

  for (const asset of assets) {
    if (!isOnBookAt(asset, disposalDates.get(asset.id), end)) continue
    const category = categoryOf.get(asset.id) ?? ""
    const bucket = closingByCategory.get(category) ?? emptyTotals()
    addTo(bucket, Number(asset.purchaseCost), accumulatedToDate.get(asset.id) ?? 0)
    closingByCategory.set(category, bucket)
  }
  for (const bucket of closingByCategory.values()) addTo(closingByData, bucket.cost, bucket.accumulated)

  rows.push({ kind: "group", label: "Saldo Akhir" })
  for (const category of [...closingByCategory.keys()].sort(sortId)) {
    const bucket = closingByCategory.get(category) ?? emptyTotals()
    rows.push({ kind: "data", cells: [category, ...cellsOf(bucket.cost, bucket.accumulated, bucket.bookValue)] })
  }
  rows.push({
    kind: "total",
    grand: true,
    label: "Jumlah Saldo Akhir",
    cells: cellsOf(closing.cost, closing.accumulated, closing.bookValue),
  })

  const isTiedOut =
    Math.abs(closing.cost - closingByData.cost) < 0.005 &&
    Math.abs(closing.accumulated - closingByData.accumulated) < 0.005 &&
    Math.abs(closing.bookValue - closingByData.bookValue) < 0.005

  if (!isTiedOut) {
    rows.push({
      kind: "notice",
      text:
        `Perhatian: saldo akhir menurut pergerakan (nilai buku ${amount(closing.bookValue)}) tidak sama ` +
        `dengan saldo akhir menurut data aset (${amount(closingByData.bookValue)}) — selisih ` +
        `${amount(closing.bookValue - closingByData.bookValue)}. Periksa riwayat penyusutan/pelepasan ` +
        `yang tanggalnya di luar periode atau aset tanpa kategori.`,
    })
  }

  return {
    table: { columns: COLUMNS, rows },
    opening,
    additions,
    depreciation,
    disposals,
    closing,
    isTiedOut,
    disposalCount: disposalsInPeriod.length,
  }
}

function sortId(a: string, b: string) {
  return a.localeCompare(b, "id-ID")
}

function byCode(a: AssetLedgerAsset, b: AssetLedgerAsset) {
  return a.code.localeCompare(b.code, "id-ID", { numeric: true })
}

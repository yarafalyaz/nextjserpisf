/**
 * Barang stok minimum — daftar barang yang sudah mencapai/menembus batas
 * minimumnya, untuk dijadikan dasar pembelian.
 *
 * Aturannya mengikuti yang sudah dipakai sistem saat menyimpan barang
 * (`minStock > 0 && qtyOnHand <= minStock`), jadi laporan ini tidak punya definisi
 * "kritis" sendiri yang bisa berbeda dari peringatan di halaman barang.
 *
 * Tiga hal yang dijaga laporan ini:
 *
 * - **Stok kosong dan minimum kosong itu dua hal berbeda.** Barang tanpa
 *   `minStock` (masih 0) tidak pernah masuk daftar — bukan karena stoknya aman,
 *   melainkan karena batasnya belum pernah diisi. Kalau TIDAK ADA satu pun barang
 *   yang punya minimum, laporan mengatakan itu terus terang: daftar kosong akan
 *   terbaca "semua aman" padahal artinya "belum bisa dinilai".
 * - **Kekurangan dihitung `minStock − qtyOnHand`**, dan nilainya memakai harga
 *   pokok barang — supaya angkanya bisa langsung dipakai memperkirakan nilai
 *   pembelian, bukan sekadar jumlah barang.
 * - **Kuantitas tidak dijumlahkan lintas satuan** (pcs + liter + set tidak bisa
 *   dijumlahkan); hanya nilai kekurangan yang bertotal, dengan catatan bila
 *   satuannya campur. Stok yang dibandingkan adalah **total seluruh gudang**
 *   (`Item.qtyOnHand`), bukan per gudang — itu dinyatakan, bukan diasumsikan.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatQuantity } from "@/lib/utils/format"
import { safeAdd, safeMultiply } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface MinStockItemInput {
  /** Id barang — dipakai tombol "Buat Permintaan" membuka form ter-prefill. */
  itemId?: number
  sku: string
  name: string
  unit: string | null
  categoryName: string | null
  /** Gudang default barang (bukan tempat stok disimpan per baris). */
  warehouseName: string | null
  vendorName: string | null
  /** Total seluruh gudang (`Item.qtyOnHand`). */
  qtyOnHand: number
  minStock: number
  cost: number
}

export interface MinStockResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  /** Baris di bawah minimum dengan id barang — untuk aksi lanjutan di halaman. */
  shortageLines: { itemId: number | null; shortage: number }[]
  totals: {
    /** Barang di bawah minimum. */
    items: number
    /** Di antaranya yang stoknya habis (0). */
    outOfStock: number
    /** Σ (minimum − stok) × harga pokok. */
    shortageValue: number
    /** Apakah ada barang yang batas minimumnya sudah diisi. */
    hasAnyMinimum: boolean
  }
  verdict: string
}

/**
 * F-2026-10-21-013 lapis aman + F-2026-10-22-070-S inti: stok minimum per
 * gudang. Minimum efektif per (barang, gudang) = override
 * `ItemWarehouseSetting.minStock` bila baris ada (`minStockSource:
 * "override"`), selain itu warisi global `Item.minStock` (`"global"`).
 * Dibandingkan ke sisa lapisan per gudang supaya gudang bengkel kosong tak
 * tertutup stok gudang pusat. Gudang tanpa lapisan untuk barang itu tidak
 * dinilai (bukan 0): barang memang tidak disimpan di sana (BR-MS-03).
 */
export type MinStockSource = "override" | "global"

export interface MinStockWarehouseInput {
  itemId: number
  sku: string
  name: string
  warehouseId: number
  warehouseName: string
  qtyAtWarehouse: number
  minStock: number
  cost: number
  /** Sumber minimum efektif; absen = warisi global (pemanggil lama). */
  minStockSource?: MinStockSource
}

export interface MinStockWarehouseLine {
  itemId: number
  sku: string
  name: string
  warehouseId: number
  warehouseName: string
  qtyAtWarehouse: number
  minStock: number
  minStockSource: MinStockSource
  shortage: number
  shortageValue: number
}

export function buildMinStockByWarehouse(rows: MinStockWarehouseInput[]): MinStockWarehouseLine[] {
  return rows
    .filter((r) => r.minStock > EPSILON && r.qtyAtWarehouse <= r.minStock + EPSILON)
    .map((r) => {
      const shortage = Math.max(0, r.minStock - r.qtyAtWarehouse)
      return {
        itemId: r.itemId,
        sku: r.sku,
        name: r.name,
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        qtyAtWarehouse: r.qtyAtWarehouse,
        minStock: r.minStock,
        minStockSource: r.minStockSource ?? "global",
        shortage,
        shortageValue: safeMultiply(shortage, r.cost, 2),
      }
    })
    .sort((a, b) => b.shortageValue - a.shortageValue || a.sku.localeCompare(b.sku, "id-ID"))
}

const EPSILON = 0.0001

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function quantity(value: number): string {
  return formatQuantity(value)
}

export function buildMinStock(items: MinStockItemInput[]): MinStockResult {
  const columns: TableColumn[] = [
    { header: "Barang", align: "left", width: 78 },
    { header: "Gudang Default", align: "left", width: 34 },
    { header: "Pemasok", align: "left", width: 46 },
    { header: "Stok", align: "right", width: 23 },
    { header: "Minimum", align: "right", width: 23 },
    { header: "Kurang", align: "right", width: 26 },
    { header: "Nilai Kurang", align: "right", width: 37 },
  ]
  const rows: TableRow[] = []

  const hasAnyMinimum = items.some((item) => item.minStock > EPSILON)
  const below = items
    .filter((item) => item.minStock > EPSILON && item.qtyOnHand <= item.minStock + EPSILON)
    .map((item) => ({ item, shortage: Math.max(0, item.minStock - item.qtyOnHand) }))
    // Habis dulu (paling mendesak), lalu kekurangan bernilai terbesar.
    .sort((a, b) => {
      const aEmpty = a.item.qtyOnHand <= EPSILON ? 0 : 1
      const bEmpty = b.item.qtyOnHand <= EPSILON ? 0 : 1
      if (aEmpty !== bEmpty) return aEmpty - bEmpty
      const byValue = b.shortage * b.item.cost - a.shortage * a.item.cost
      return byValue !== 0 ? byValue : a.item.sku.localeCompare(b.item.sku, "id-ID")
    })

  const totals: MinStockResult["totals"] = {
    items: below.length,
    outOfStock: below.filter(({ item }) => item.qtyOnHand <= EPSILON).length,
    shortageValue: below.reduce(
      (sum, { item, shortage }) => safeAdd(sum, safeMultiply(shortage, item.cost, 2), 2),
      0,
    ),
    hasAnyMinimum,
  }

  const units = new Set<string>()

  for (const { item, shortage } of below) {
    if (item.unit) units.add(item.unit)
    rows.push({
      kind: "data",
      cells: [
        `${item.sku} ${item.name}`,
        item.warehouseName ?? "–",
        item.vendorName ?? "–",
        quantity(item.qtyOnHand),
        quantity(item.minStock),
        quantity(shortage),
        amount(safeMultiply(shortage, item.cost, 2)),
      ],
    })
  }

  let verdict: string
  if (!hasAnyMinimum) {
    verdict = "Belum ada barang yang diisi batas minimum stoknya."
    rows.push({
      kind: "notice",
      text:
        "Belum ada satu pun barang yang diisi batas minimum stoknya, jadi laporan ini belum bisa menilai apa pun. " +
        "Isi kolom \"Stok Minimum\" pada master barang lebih dulu — daftar yang kosong di sini berarti belum " +
        "dinilai, bukan berarti semua stok aman.",
    })
  } else if (below.length === 0) {
    verdict = "Tidak ada barang yang mencapai batas minimum."
    rows.push({
      kind: "notice",
      text: "Semua barang yang punya batas minimum masih di atas batasnya — tidak ada yang perlu dibeli.",
    })
  } else {
    verdict = `${below.length} barang mencapai/menembus batas minimum, ${totals.outOfStock} di antaranya habis.`
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah Nilai Kekurangan",
      cells: ["", "", "", "", "", "", amount(totals.shortageValue)],
    })
    rows.push({
      kind: "notice",
      text:
        `${below.length} barang sudah mencapai atau menembus batas minimumnya` +
        `${totals.outOfStock > 0 ? `, ${totals.outOfStock} di antaranya stoknya habis` : ""}. ` +
        `Nilai kekurangan dihitung dari (minimum − stok) × harga pokok sebagai perkiraan nilai pembelian.`,
    })
  }

  if (below.length > 0) {
    rows.push({
      kind: "notice",
      text:
        "Stok yang dibandingkan adalah total seluruh gudang (kolom Gudang Default hanya menunjukkan gudang " +
        "biasanya barang disimpan), sehingga barang yang menipis di satu gudang tetapi masih banyak di gudang " +
        "lain tidak akan muncul di daftar ini.",
    })
  }

  if (units.size > 1) {
    rows.push({
      kind: "notice",
      text:
        "Periode ini memuat lebih dari satu satuan, jadi kolom jumlah TIDAK dijumlahkan — hanya kolom nilai yang " +
        "bertotal.",
    })
  }

  return {
    table: { columns, rows },
    shortageLines: below.map(({ item, shortage }) => ({
      itemId: item.itemId ?? null,
      shortage,
    })),
    totals,
    verdict,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function minStockSummary(result: MinStockResult): string {
  if (!result.totals.hasAnyMinimum) return "Batas minimum belum diisi untuk barang mana pun"
  if (result.totals.items === 0) return "Tidak ada barang yang mencapai minimum"
  return (
    `${result.totals.items} barang mencapai minimum` +
    `${result.totals.outOfStock > 0 ? ` (${result.totals.outOfStock} habis)` : ""} · ` +
    `perkiraan belanja ${formatCurrency(result.totals.shortageValue)}`
  )
}

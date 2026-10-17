/**
 * Baris surat jalan yang dihitung dari baris Pesanan Penjualan.
 *
 * Satu implementasi dipakai dua tempat supaya angka yang dilihat operator sama
 * dengan angka yang dikirim ke server:
 *
 * - halaman `/penjualan/surat-jalan/tambah` menghitung baris awal (prefill), dan
 * - form surat jalan menghitung ulang saat pemilih pesanan diganti.
 *
 * Aturan sisa: `sisa = qty pesanan − qty yang sudah masuk surat jalan`. Surat
 * jalan yang **dibatalkan** tidak dikurangkan (barangnya tidak pernah keluar),
 * sedangkan surat jalan konsep ikut dikurangkan supaya operator tidak membuat dua
 * surat jalan untuk barang yang sama.
 *
 * Baris pesanan tanpa barang katalog (`itemId` null) dilewati: `DeliveryOrderItem.itemId`
 * wajib diisi di skema, dan laporan Pemenuhan Pesanan mencocokkan lewat
 * `DeliveryOrderItem.salesOrderItemId` yang hanya ada pada baris bersisa.
 */

/** Status surat jalan yang tidak mengurangi sisa pesanan. */
export const VOID_DELIVERY_ORDER_STATUSES = ["cancelled"]

export interface DeliveryOrderLineOption {
  /** id `SalesOrderItem` — nilai yang ditulis ke `DeliveryOrderItem.salesOrderItemId`. */
  salesOrderItemId: number
  itemId: number
  description: string
  orderedQty: number
  /** Sudah masuk surat jalan (selain yang dibatalkan). */
  shippedQty: number
  remainingQty: number
}

interface RawOrderItem {
  id: number
  itemId: number | null
  description: string | null
  qty: number | string | { toString(): string }
}

function toNumber(value: number | string | { toString(): string }): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function buildDeliveryOrderLines(params: {
  items: RawOrderItem[]
  /** Jumlah qty per `SalesOrderItem.id` dari surat jalan yang tidak dibatalkan. */
  shippedByLine?: Map<number, number>
  /** Nama barang dari master, untuk label saat `description` baris kosong. */
  itemNameById?: Map<number, string>
}): DeliveryOrderLineOption[] {
  const shippedByLine = params.shippedByLine ?? new Map<number, number>()
  const itemNameById = params.itemNameById ?? new Map<number, string>()

  const lines: DeliveryOrderLineOption[] = []
  for (const item of params.items) {
    if (item.itemId === null) continue
    const orderedQty = toNumber(item.qty)
    const shippedQty = shippedByLine.get(item.id) ?? 0
    const remainingQty = orderedQty - shippedQty
    if (remainingQty <= 0) continue
    lines.push({
      salesOrderItemId: item.id,
      itemId: item.itemId,
      description: item.description?.trim() || itemNameById.get(item.itemId) || `Item #${item.itemId}`,
      orderedQty,
      shippedQty,
      remainingQty,
    })
  }
  return lines
}

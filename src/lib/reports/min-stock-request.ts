/**
 * Prefill Permintaan Pembelian dari laporan stok minimum (F-2026-10-20-18).
 *
 * Format segmen path: `item/<id>:<qty>,<id>:<qty>` (ter-encode) — qty adalah
 * saran kekurangan (minimum − stok), staf tetap bisa menyuntingnya bebas di
 * form sebelum simpan.
 * Parser pure: id/qty tidak valid dibuang, id duplikat digabung (qty dijumlah).
 */

export interface MinStockPrefillLine {
  itemId: number
  qty: number
}

export function buildMinStockRequestHref(
  lines: { itemId: number | null; shortage: number }[],
): string | null {
  const valid = lines.filter(
    (line): line is { itemId: number; shortage: number } =>
      line.itemId !== null && line.itemId > 0 && line.shortage > 0,
  )
  if (valid.length === 0) return null
  const param = valid.map((line) => `${line.itemId}:${line.shortage}`).join(",")
  return `/pembelian/permintaan/tambah/item/${encodeURIComponent(param)}`
}

/**
 * Agregasi saran titik pesan-ulang per BARANG untuk prefill permintaan.
 *
 * `suggestedQty` per pasang (barang, gudang) = max(0, titik −
 * (stok gudang + PO masuk)) dan `incomingQty` adalah angka per BARANG
 * yang sama di semua pasang (PurchaseOrder tanpa warehouseId — lihat
 * reorder-point.ts). Menjumlahkan suggestedQty antar-gudang akan
 * mengurangkan PO masuk yang sama berkali-kali. Agregat yang sah:
 * max(0, Σ titik − Σ stok − PO masuk) dengan PO masuk dikurangkan
 * SEKALI. Hanya pasang `pesan_sekarang` yang ikut; tidak_dinilai
 * (suggestedQty null) tidak pernah menjadi saran.
 */
export function buildReorderPointRequestHref(
  lines: readonly {
    itemId: number
    status: string
    reorderPoint: number | null
    qtyAtWarehouse: number | null
    incomingQty: number
    suggestedQty: number | null
  }[],
): string | null {
  const byItem = new Map<
    number,
    { pointTotal: number; stockTotal: number; incomingQty: number }
  >()
  for (const line of lines) {
    if (line.status !== "pesan_sekarang") continue
    if (line.reorderPoint === null || line.suggestedQty === null) continue
    const acc = byItem.get(line.itemId) ?? {
      pointTotal: 0,
      stockTotal: 0,
      incomingQty: line.incomingQty,
    }
    acc.pointTotal += line.reorderPoint
    acc.stockTotal += line.qtyAtWarehouse ?? 0
    byItem.set(line.itemId, acc)
  }
  return buildMinStockRequestHref(
    [...byItem.entries()].map(([itemId, acc]) => ({
      itemId,
      shortage: Math.max(0, acc.pointTotal - acc.stockTotal - acc.incomingQty),
    })),
  )
}

export function parseMinStockPrefill(
  raw: string | undefined,
  validItemIds: ReadonlySet<number>,
): MinStockPrefillLine[] {
  if (!raw) return []
  const merged = new Map<number, number>()
  for (const part of raw.split(",")) {
    const [idText, qtyText] = part.split(":")
    const itemId = Number(idText)
    const qty = Number(qtyText)
    if (!Number.isInteger(itemId) || itemId <= 0 || !validItemIds.has(itemId)) continue
    if (!Number.isFinite(qty) || qty <= 0) continue
    merged.set(itemId, (merged.get(itemId) ?? 0) + qty)
  }
  return [...merged.entries()].map(([itemId, qty]) => ({ itemId, qty }))
}

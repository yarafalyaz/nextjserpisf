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

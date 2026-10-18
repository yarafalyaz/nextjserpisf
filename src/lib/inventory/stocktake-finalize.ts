/**
 * P1-5: logika murni sesi opname — finalisasi hitungan dan variance.
 * Murni agar teruji tanpa DB.
 */

export interface CountLine {
  itemId: number
  systemQty: number
  count1: number | null
  count2: number | null
}

export interface FinalLine {
  itemId: number
  systemQty: number
  count1: number | null
  count2: number | null
  finalCount: number
  variance: number
  needsRecount: boolean
}

/**
 * Final = count2 bila ada, else count1. Baris tanpa count1 = belum dihitung
 * (dilewati, bukan 0 — 0 adalah hitungan sah "stok kosong").
 * needsRecount = count1 ada dan (tanpa count2) dan count1 != sistem.
 */
export function finalizeCounts(lines: CountLine[]): FinalLine[] {
  const out: FinalLine[] = []
  for (const l of lines) {
    if (l.count1 == null) continue
    const finalCount = l.count2 ?? l.count1
    out.push({
      itemId: l.itemId,
      systemQty: l.systemQty,
      count1: l.count1,
      count2: l.count2,
      finalCount,
      variance: finalCount - l.systemQty,
      needsRecount: l.count2 == null && l.count1 !== l.systemQty,
    })
  }
  return out
}

/**
 * Delta concurrent: movement masuk/keluar selama sesi (live - snapshot).
 * Posting memakai LIVE sebagai basis (selisih tak hilang), dan delta dicatat
 * di laporan sesi agar auditor tahu berapa yang bergerak selama penghitungan.
 */
export function concurrentDelta(snapshotQty: number, liveQty: number): number {
  return liveQty - snapshotQty
}

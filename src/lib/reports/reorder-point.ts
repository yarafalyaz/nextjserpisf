/**
 * Titik pesan-ulang (reorder point) + saran qty pesan per (barang, gudang) —
 * F-2026-10-25-048-S (sisa induk F-2026-10-21-013), BR-ROP-01..08.
 *
 * Pure (tanpa Prisma): pemanggil (loader) menyiapkan minimum EFEKTIF
 * existing (`min-stock-effective`), sisa lapisan per gudang, laju pakai,
 * lead time penampung `ItemWarehouseSetting.leadTimeDays`, dan PO masuk.
 *
 * Rumus mengikat (putusan Lead 2026-10-26 00:40 WIB):
 * - Q-ROP-1/BR-ROP-02: titik = minimum efektif + ceil(laju harian ×
 *   leadTimeDays); laju harian dari MaterialIssue `completed` per gudang
 *   selama 90 hari kalender WIB dibagi 90 (dihitung loader; builder hanya
 *   menerima angka laju). Laju 0 → titik = minimum efektif, tertanda
 *   persis "tanpa laju".
 * - BR-ROP-04: saran qty = max(0, titik − (tersedia + PO masuk)).
 * - BR-ROP-05: pasangan tanpa lapisan / lead time kosong / minimum
 *   efektif 0 masuk ember `tidak_dinilai` TERHITUNG — tidak pernah
 *   tampil sebagai saran, dan daftar kosong tidak terbaca "semua aman".
 * - BR-ROP-06: `kritis` (tersedia <= minimum efektif) dan
 *   `pesan_sekarang` (tersedia + PO masuk <= titik) dua label terpisah;
 *   PO masuk besar tidak menghapus kritis.
 *
 * Catatan fisik (dilaporkan ke Lead di PR): PurchaseOrder TIDAK punya
 * warehouseId, jadi sisa PO terbuka (ordered/partial_received,
 * qty − receivedQty) hanya sah per BARANG, bukan per gudang. Loader
 * meneruskan `incomingQty` per barang apa adanya; builder TIDAK menebak
 * alokasi gudang. Konsekuensi jujur: PO masuk barang yang sama mengurangi
 * saran di semua gudang penilaiannya — dinyatakan di field, bukan
 * disembunyikan.
 */

export type ReorderPointStatus = "tidak_dinilai" | "aman" | "pesan_sekarang"

export interface ReorderPointInput {
  itemId: number
  sku: string
  name: string
  unit: string | null
  warehouseId: number
  warehouseName: string
  /** Sisa lapisan gudang itu; null = pasangan tanpa lapisan (tidak dinilai). */
  qtyAtWarehouse: number | null
  /** Minimum efektif existing (override pasangan > global). */
  minStock: number
  minStockSource: "override" | "global"
  /** Penampung Q-ROP-2; null = belum diisi (tidak dinilai, BR-ROP-03). */
  leadTimeDays: number | null
  /** Laju pakai harian (qty/hari) dari jendela Q-ROP-1; 0 = tanpa laju. */
  dailyUsage: number
  /** Sisa PO terbuka per barang (lihat catatan fisik di atas). */
  incomingQty: number
}

export interface ReorderPointLine {
  itemId: number
  sku: string
  name: string
  unit: string | null
  warehouseId: number
  warehouseName: string
  qtyAtWarehouse: number | null
  minStock: number
  minStockSource: "override" | "global"
  leadTimeDays: number | null
  dailyUsage: number
  /** Null bila tidak dinilai. */
  reorderPoint: number | null
  incomingQty: number
  /** Null bila tidak dinilai. */
  suggestedQty: number | null
  status: ReorderPointStatus
  /** Label terpisah BR-ROP-06; tetap true walau PO masuk besar. */
  isCritical: boolean
  /** Persis "tanpa laju" bila dinilai tetapi laju 0 (BR-ROP-02). */
  usageNote: "tanpa laju" | null
  /** Alasan masuk ember tidak_dinilai; null bila dinilai. */
  notAssessedReason: "tanpa_lapisan" | "lead_time_kosong" | "minimum_nol" | null
}

export interface ReorderPointResult {
  lines: ReorderPointLine[]
  counts: {
    assessed: number
    notAssessed: number
    orderNow: number
    critical: number
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function buildReorderPoints(rows: ReorderPointInput[]): ReorderPointResult {
  const lines: ReorderPointLine[] = rows.map((r) => {
    const base: ReorderPointLine = {
      itemId: r.itemId,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      qtyAtWarehouse: r.qtyAtWarehouse,
      minStock: r.minStock,
      minStockSource: r.minStockSource,
      leadTimeDays: r.leadTimeDays,
      dailyUsage: r.dailyUsage,
      reorderPoint: null,
      incomingQty: r.incomingQty,
      suggestedQty: null,
      status: "tidak_dinilai",
      isCritical: false,
      usageNote: null,
      notAssessedReason: null,
    }
    if (r.qtyAtWarehouse == null) return { ...base, notAssessedReason: "tanpa_lapisan" }
    if (r.leadTimeDays == null) return { ...base, notAssessedReason: "lead_time_kosong" }
    if (!(r.minStock > 0)) return { ...base, notAssessedReason: "minimum_nol" }

    const leadNeed = Math.ceil(Math.max(0, r.dailyUsage) * r.leadTimeDays)
    const reorderPoint = round2(r.minStock + leadNeed)
    const available = r.qtyAtWarehouse + Math.max(0, r.incomingQty)
    return {
      ...base,
      reorderPoint,
      suggestedQty: round2(Math.max(0, reorderPoint - available)),
      status: available <= reorderPoint ? "pesan_sekarang" : "aman",
      isCritical: r.qtyAtWarehouse <= r.minStock,
      usageNote: r.dailyUsage > 0 ? null : "tanpa laju",
    }
  })

  // pesan_sekarang dulu (saran terbesar), lalu aman, lalu tidak_dinilai;
  // di dalam ember: sku A-Z supaya render stabil.
  const rank = (l: ReorderPointLine) =>
    l.status === "pesan_sekarang" ? 0 : l.status === "aman" ? 1 : 2
  lines.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.suggestedQty ?? 0) - (a.suggestedQty ?? 0) ||
      a.sku.localeCompare(b.sku, "id-ID") ||
      a.warehouseName.localeCompare(b.warehouseName, "id-ID"),
  )

  return {
    lines,
    counts: {
      assessed: lines.filter((l) => l.status !== "tidak_dinilai").length,
      notAssessed: lines.filter((l) => l.status === "tidak_dinilai").length,
      orderNow: lines.filter((l) => l.status === "pesan_sekarang").length,
      critical: lines.filter((l) => l.isCritical).length,
    },
  }
}

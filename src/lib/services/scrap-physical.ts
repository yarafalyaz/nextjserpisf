/**
 * Klasifikasi fisik sisa potong plat/profil (F-2026-10-24-098-S, delta
 * di atas scrap-classification.ts F-071-S/066-V).
 *
 * Aturan (BR-SCRAP-03..10):
 * - Satu sisa fisik = satu kelas: remnant usable ATAU scrap (bukan keduanya).
 * - Remnant usable wajib dimensi teks + ukuran terukur + tautan baris issue;
 *   ambang minimum dibaca dari snapshot kategori (null = belum ditetapkan
 *   kepala bengkel -> usable ditolak, jangan karang angka).
 * - Scrap murni besi tua wajib berat kg (satuan issue tidak rekonsiliasi
 *   ke penjualan timbang tanpa kg).
 * - Tinjau foreman abnormal = operasional saja: disposisi tidak mengubah
 *   klasifikasi/nilai/jurnal 066-V dan tidak menahan complete.
 * - Rekonsiliasi baris: issue = terpasang + remnant + scrap; selisih =
 *   temuan laporan, bukan penyesuaian diam-diam.
 *
 * Pure (tanpa Prisma/DOM) — UI dilarang menghitung ulang.
 */

export const SCRAP_REVIEW_DISPOSITIONS = ["diterima_wajar", "kelalaian"] as const
export type ScrapReviewDisposition = (typeof SCRAP_REVIEW_DISPOSITIONS)[number]

export const SCRAP_REVIEW_STATUS_PENDING = "menunggu_tinjau"
export const SCRAP_REVIEW_STATUS_DONE = "ditinjau"

/** Tautan sumber remnant yang sah (baris issue asal). */
export const REMNANT_SOURCE_TYPES = ["material_issue_item", "production_order_material"] as const

const EPS = 0.0001

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Validasi remnant usable baru. Mengembalikan pesan error Bahasa Indonesia
 * atau null bila sah. `minMeasureSnapshot` = ambang kategori terbaca saat
 * buat (null = belum ditetapkan -> usable ditolak jujur, BR-SCRAP-05).
 */
export function validateUsableRemnant(input: {
  dimensions?: string | null
  measuredSize?: number | null
  minMeasureSnapshot?: number | null
  sourceType?: string | null
  sourceId?: number | null
}): string | null {
  if (!(input.dimensions ?? "").trim()) {
    return "Remnant usable wajib diisi dimensi terukur."
  }
  const measured = Number(input.measuredSize ?? Number.NaN)
  if (!Number.isFinite(measured) || measured <= 0) {
    return "Remnant usable wajib diisi ukuran terukur lebih dari 0."
  }
  const sourceType = (input.sourceType ?? "").trim()
  if (!(REMNANT_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    return "Remnant usable wajib tertaut ke baris issue asal (sumber material_issue_item/production_order_material)."
  }
  const sourceId = Number(input.sourceId ?? Number.NaN)
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) {
    return "Remnant usable wajib tertaut ke baris issue asal (sumber tidak valid)."
  }
  const min = input.minMeasureSnapshot
  if (min == null || !Number.isFinite(Number(min)) || Number(min) <= 0) {
    return "Ambang minimum usable kategori belum ditetapkan kepala bengkel — remnant tidak boleh berstatus usable."
  }
  if (measured + EPS < Number(min)) {
    return "Ukuran sisa di bawah ambang minimum usable kategori — catat sebagai scrap, bukan remnant usable."
  }
  return null
}

/** Berat besi tua wajib > 0 kg saat sisa masuk penampungan scrap. */
export function validateScrapWeightKg(weightKg?: number | null): string | null {
  const kg = Number(weightKg ?? Number.NaN)
  if (!Number.isFinite(kg) || kg <= 0) {
    return "Berat besi tua (kg) wajib diisi lebih dari 0 saat sisa dicatat sebagai scrap."
  }
  return null
}

/**
 * Status tinjau sesudah complete: abnormalQty > 0 -> menunggu_tinjau;
 * selain itu null (tidak masuk antrean). Tidak pernah menahan complete.
 */
export function scrapReviewStatusAfterComplete(abnormalQty?: number | null): string | null {
  return Number(abnormalQty ?? 0) > EPS ? SCRAP_REVIEW_STATUS_PENDING : null
}

/** Validasi disposisi tinjau foreman (BR-SCRAP-09). */
export function validateScrapReview(input: {
  disposition?: string | null
  note?: string | null
}): string | null {
  if (!(SCRAP_REVIEW_DISPOSITIONS as readonly string[]).includes((input.disposition ?? "") as ScrapReviewDisposition)) {
    return "Disposisi tinjau scrap wajib dipilih: diterima_wajar atau kelalaian."
  }
  if (input.disposition === "kelalaian" && !(input.note ?? "").trim()) {
    return "Disposisi kelalaian wajib disertai catatan dan tindak lanjut."
  }
  return null
}

export interface ScrapReconciliation {
  issueQty: number
  installedQty: number
  remnantQty: number
  scrapQty: number
  /** issue - (terpasang + remnant + scrap); 0 = rekonsiliasi bersih. */
  varianceQty: number
  /** true bila |selisih| > epsilon — tampil temuan, angka tidak diubah. */
  hasFinding: boolean
}

/** Rekonsiliasi per baris issue (BR-SCRAP-07). Terpasang = issue - scrap - remnant tidak diasumsikan; pemanggil menyerahkan angka terpasang eksplisit bila ada, default issue-scrap-remnant tidak dipakai diam-diam. */
export function reconcileScrapLine(input: {
  issueQty: number
  installedQty: number
  remnantQty: number
  scrapQty: number
}): ScrapReconciliation {
  const issueQty = round2(Math.max(0, Number(input.issueQty ?? 0)))
  const installedQty = round2(Math.max(0, Number(input.installedQty ?? 0)))
  const remnantQty = round2(Math.max(0, Number(input.remnantQty ?? 0)))
  const scrapQty = round2(Math.max(0, Number(input.scrapQty ?? 0)))
  const varianceQty = round2(issueQty - installedQty - remnantQty - scrapQty)
  return {
    issueQty,
    installedQty,
    remnantQty,
    scrapQty,
    varianceQty,
    hasFinding: Math.abs(varianceQty) > EPS,
  }
}

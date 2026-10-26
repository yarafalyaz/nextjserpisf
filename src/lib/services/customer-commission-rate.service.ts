/**
 * F-2026-10-25-036-S: resolusi tarif komisi per kategori pelanggan +
 * penjaga histori bertanggal. MURNI (tanpa Prisma/DOM): pemanggil menyuplai
 * baris CustomerCommissionRate yang sudah dimuat; fungsi memilih tarif
 * efektif dan menolak rentang tumpang tindih / edit baris beku.
 *
 * Aturan mengikat (vonis F-2026-10-22-056-V + rekonsiliasi F-2026-10-22-058-V):
 * - BR-KT36-02: resolusi per TANGGAL FAKTUR, masa semi-terbuka
 *   `effectiveFrom <= tanggal faktur < effectiveTo` (effectiveTo null = terbuka).
 *   TIDAK diseragamkan dengan katalog inklusif domain lain.
 * - BR-KT36-03/09: tanpa kategori / tanpa baris berlaku = tarif 0 jujur
 *   (fail-soft berlabel lewat snapshot kosong), bukan tebakan.
 * - BR-KT36-08: baris yang sudah menjadi sumber snapshot faktur dilarang
 *   diedit persen/effectiveFrom-nya maupun dihapus; koreksi = tutup masa
 *   + baris baru.
 * - W1: rentang tumpang tindih untuk kategori sama ditolak berisik.
 */

export interface CommissionRateRow {
  id: number
  customerCategoryId: number
  /** Persen Decimal(5,2), mis. 2 = 2%. */
  commissionPercent: number
  effectiveFrom: Date
  /** null = masa terbuka. */
  effectiveTo: Date | null
}

export interface ResolvedCommissionRate {
  /** 0 bila tidak ada baris berlaku / tanpa kategori (BR-KT36-03/09). */
  commissionPercent: number
  /** Kategori acuan faktur (kategori pelanggan saat snapshot); null bila pelanggan tanpa kategori. */
  customerCategoryId: number | null
  /** Baris histori sumber snapshot; null bila tarif 0 jujur tanpa baris. */
  rateId: number | null
}

const dayMs = (d: Date): number =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * Resolusi tarif untuk satu faktur: kategori pelanggan faktur + tanggal faktur.
 * Perbandingan per tanggal kalender UTC (kolom @db.Date tersimpan tengah
 * malam UTC); masa semi-terbuka from <= tgl < to.
 */
export function resolveCommissionRate(
  rows: readonly CommissionRateRow[],
  customerCategoryId: number | null,
  invoiceDate: Date,
): ResolvedCommissionRate {
  if (customerCategoryId === null) {
    return { commissionPercent: 0, customerCategoryId: null, rateId: null }
  }
  const t = dayMs(invoiceDate)
  const hit = rows.find(
    (r) =>
      r.customerCategoryId === customerCategoryId &&
      dayMs(r.effectiveFrom) <= t &&
      (r.effectiveTo === null || t < dayMs(r.effectiveTo)),
  )
  if (!hit) {
    return { commissionPercent: 0, customerCategoryId, rateId: null }
  }
  return {
    commissionPercent: hit.commissionPercent,
    customerCategoryId,
    rateId: hit.id,
  }
}

/** true bila dua masa semi-terbuka [from,to) tumpang tindih (to null = tak hingga). */
export function commissionRangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aF = dayMs(aFrom)
  const bF = dayMs(bFrom)
  const aT = aTo === null ? Number.POSITIVE_INFINITY : dayMs(aTo)
  const bT = bTo === null ? Number.POSITIVE_INFINITY : dayMs(bTo)
  return aF < bT && bF < aT
}

/**
 * Penjaga tulis histori (dipanggil service dalam tx sebelum create/update/delete):
 * - masa tidak valid (effectiveTo <= effectiveFrom) ditolak;
 * - tumpang tindih dengan baris lain kategori sama ditolak berisik (W1/AC-KT-3);
 * - baris sumber snapshot faktur: persen/effectiveFrom beku + hapus ditolak
 *   (BR-KT36-08/AC-KT-4); hanya effectiveTo boleh ditutup sebagai koreksi.
 * Mengembalikan pesan error Bahasa Indonesia, atau null bila lolos.
 */
export function validateCommissionRateWrite(input: {
  existing: readonly CommissionRateRow[]
  /** Baris yang diedit; null = baris baru. */
  targetId: number | null
  customerCategoryId: number
  commissionPercent: number
  effectiveFrom: Date
  effectiveTo: Date | null
  /** true bila targetId sudah dirujuk snapshot faktur mana pun. */
  targetIsSnapshotSource: boolean
  isDelete?: boolean
}): string | null {
  const { existing, targetId } = input
  if (input.isDelete) {
    if (input.targetIsSnapshotSource) {
      return "Baris tarif ini sudah menjadi sumber snapshot faktur dan tidak dapat dihapus. Tutup masa berlakunya lalu buat baris baru."
    }
    return null
  }
  if (!(input.commissionPercent >= 0 && input.commissionPercent <= 100)) {
    return "Persen komisi harus antara 0 dan 100."
  }
  if (input.effectiveTo !== null && dayMs(input.effectiveTo) <= dayMs(input.effectiveFrom)) {
    return "Tanggal berakhir masa tarif harus sesudah tanggal mulai berlaku."
  }
  const target = targetId === null ? undefined : existing.find((r) => r.id === targetId)
  if (target && input.targetIsSnapshotSource) {
    const percentChanged = Number(target.commissionPercent) !== input.commissionPercent
    const fromChanged = dayMs(target.effectiveFrom) !== dayMs(input.effectiveFrom)
    if (percentChanged || fromChanged) {
      return "Baris tarif ini sudah menjadi sumber snapshot faktur dan tidak dapat diubah persen atau tanggal mulainya. Tutup masa berlakunya lalu buat baris baru."
    }
  }
  const overlap = existing.some(
    (r) =>
      r.id !== targetId &&
      r.customerCategoryId === input.customerCategoryId &&
      commissionRangesOverlap(input.effectiveFrom, input.effectiveTo, r.effectiveFrom, r.effectiveTo),
  )
  if (overlap) {
    return "Masa berlaku tarif bertumpang tindih dengan baris tarif lain untuk kategori yang sama."
  }
  return null
}

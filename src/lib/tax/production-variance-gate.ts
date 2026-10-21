/**
 * Gerbang jurnal disposisi varians produksi (F-006).
 *
 * Vonis FINAL accountant F-2026-10-21-006:
 * - Default: jurnal disposisi MATI. `ProductionOrder.variance` = angka
 *   ANALITIS standar-vs-aktual, bukan saldo menunggu dijurnal.
 * - Disposisi HANYA sah bila tenant aktifkan `standardCostingEnabled`
 *   eksplisit DAN FG dinilai standar. Tanpa mode itu, aksi disposisi
 *   tidak ada — pemanggil WAJIB gate lewat `assertDispositionAllowed`.
 * - Akun selisih = `productionVarianceAccountId` fail-closed (kosong =
 *   tolak berisik; JANGAN fallback materialExpense/cogs — itu hanya utk
 *   selisih PEMBULATAN < ambang).
 * - Baris `uncalibrated` (standar 0) DILARANG ikut disposisi.
 *
 * Pure (tanpa Prisma/DOM).
 */

export interface DispositionGate {
  standardCostingEnabled: boolean
  productionVarianceAccountId: number | null
}

/**
 * Gerbang mati-default: mode MATI → tolak sebelum jurnal apa pun.
 * Falsifikasi: mode mati → nol jurnal varians walau order completed.
 */
export function assertDispositionAllowed(gate: DispositionGate): { accountId: number } {
  if (!gate.standardCostingEnabled) {
    throw new Error(
      "Disposisi varians produksi MATI (mode standard-costing tidak aktif) — variance order adalah angka analitis, bukan saldo yang dijurnal.",
    )
  }
  if (gate.productionVarianceAccountId == null || !(gate.productionVarianceAccountId > 0)) {
    throw new Error(
      "Akun selisih biaya produksi belum dikonfigurasi — disposisi varians ditolak (tanpa fallback ke beban lain).",
    )
  }
  return { accountId: gate.productionVarianceAccountId }
}

/**
 * Saring baris disposisi: hanya terkalibrasi (standar > 0). Baris
 * `uncalibrated` tidak pernah ikut jurnal.
 */
export function calibratedLines<T extends { standardCost: number }>(lines: T[]): T[] {
  return lines.filter((l) => l.standardCost > 0)
}

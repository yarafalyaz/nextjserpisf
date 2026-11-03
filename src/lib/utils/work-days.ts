/**
 * Pengurai `WorkSchedule.workDays` — JALUR TUNGGAL.
 *
 * Kolom ini menyimpan CSV angka hari JavaScript (`0` = Minggu … `6` = Sabtu).
 * Sebelum modul ini ada, setiap pembaca menulis ulang penguraiannya sendiri, dan
 * beberapa di antaranya lupa membuang token kosong: `Number("")` bernilai **0**,
 * yaitu hari Minggu yang SAH. Jadwal tanpa hari kerja (kolom default `""`) atau
 * teks berlebih seperti `"1,2,3,"` karenanya terbaca sebagai **hanya Minggu**,
 * dan fallback Senin–Jumat di bawahnya tidak pernah hidup. Dampaknya bukan
 * kosmetik: slip gaji massal menghitung hari kerja hanya hari Minggu, sehingga
 * potongan absen hilang untuk hari biasa dan hari Minggu selalu "absent".
 *
 * Karena itu token kosong WAJIB dibuang sebelum `Number()`. Jadwal yang benar-
 * benar kosong/rusak diperlakukan sebagai "tanpa hari kerja" dan pemakai memakai
 * fallback Senin–Jumat (`parseWorkDays`), sambil `parseWorkDaysWithFallback`
 * memberi tahu kapan fallback itu dipakai (dipakai laporan untuk menandai
 * jadwal yang tidak sah, bukan mengarang hari kerja).
 */

const FALLBACK_WEEKDAYS = [1, 2, 3, 4, 5] as const

/**
 * Hari kerja dari CSV, urut naik tanpa duplikat. Teks kosong/rusak → Senin–Jumat.
 * `0` yang ditulis eksplisit tetap Minggu.
 */
export function parseWorkDays(raw: string | null | undefined): number[] {
  return parseWorkDaysWithFallback(raw).days
}

/** Seperti `parseWorkDays`, sekaligus melaporkan apakah fallback yang dipakai. */
export function parseWorkDaysWithFallback(raw: string | null | undefined): {
  days: number[]
  usedFallback: boolean
} {
  const days = new Set<number>()
  for (const token of (raw ?? "").split(",")) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const day = Number(trimmed)
    if (Number.isInteger(day) && day >= 0 && day <= 6) days.add(day)
  }
  if (days.size === 0) return { days: [...FALLBACK_WEEKDAYS], usedFallback: true }
  return { days: [...days].sort((a, b) => a - b), usedFallback: false }
}

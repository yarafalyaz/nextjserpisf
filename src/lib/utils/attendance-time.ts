/**
 * Konvensi waktu absensi — JALUR TUNGGAL.
 *
 * Modul ini adalah yang dirujuk catatan di `date-only.ts` ("`getWibTodayUtcDate`
 * in attendance-time.ts"), tetapi berkasnya belum pernah ada. Akibatnya setiap
 * penulis absensi menebak sendiri konversinya, dan salah tebak berarti absensi
 * tercatat pada hari yang salah — kesalahan yang tidak terlihat sampai laporan
 * gaji atau penalti keterlambatan dihitung.
 *
 * Dua konvensi hidup berdampingan, dan mencampurnya menggeser tanggal satu hari:
 *
 * 1. `attendance.date` = TENGAH MALAM UTC untuk hari kalender WIB.
 * 2. `checkIn` / `checkOut` = INSTAN UTC dari jam dinding WIB
 *    (08:05 WIB tersimpan sebagai 01:05Z — lihat seed absensi).
 *
 * Aplikasi berjalan dengan TZ=Asia/Jakarta. Jangan pernah menurunkan tanggal
 * absensi dengan `toISOString().split("T")[0]`.
 */

/** Offset jam dinding WIB terhadap UTC. */
export const WIB_OFFSET_HOURS = 7

const MS_PER_HOUR = 3_600_000

/** Tengah malam UTC untuk hari kalender WIB hari ini. */
export function getWibTodayUtcDate(now: Date = new Date()): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_HOURS * MS_PER_HOUR)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

/** Tengah malam UTC untuk hari kalender WIB dari `YYYY-MM-DD`. */
export function wibDateToUtcMidnight(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Instan UTC untuk jam dinding WIB `HH:MM` pada `YYYY-MM-DD`.
 *
 * Jam di bawah 07:00 menghasilkan instan pada hari UTC sebelumnya — itu memang
 * benar, karena 05:00 WIB adalah 22:00Z hari sebelumnya.
 */
export function wibTimeToUtcInstant(dateOnly: string, time: string): Date {
  const [year, month, day] = dateOnly.split("-").map(Number)
  const [hours, minutes] = time.split(":").map(Number)
  return new Date(Date.UTC(year, month - 1, day, hours - WIB_OFFSET_HOURS, minutes))
}

/** Menit sejak tengah malam menurut jam dinding WIB dari sebuah instan UTC. */
export function wibMinutesOfDay(instant: Date): number {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * MS_PER_HOUR)
  return wib.getUTCHours() * 60 + wib.getUTCMinutes()
}

function minutesOfTimeString(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/**
 * Menit keterlambatan menurut jam mulai jadwal kerja.
 *
 * Nilai inilah yang DISIMPAN ke `attendance.lateMinutes`, dan kolom itu yang
 * dibaca `calculateLatePenalty` (`where: { lateMinutes: { gt: 0 } }`) serta
 * `getDailyAttendanceMetrics`. Karena itu perhitungannya tidak boleh diduplikasi
 * di tempat lain — kalau aturannya berubah, ubah di sini.
 */
export function computeLateMinutes(scheduleStart: string, checkIn: Date | null): number {
  if (!checkIn) return 0
  return Math.max(0, wibMinutesOfDay(checkIn) - minutesOfTimeString(scheduleStart))
}

/** Menit lembur menurut jam selesai jadwal kerja. */
export function computeOvertimeMinutes(scheduleEnd: string, checkOut: Date | null): number {
  if (!checkOut) return 0
  return Math.max(0, wibMinutesOfDay(checkOut) - minutesOfTimeString(scheduleEnd))
}

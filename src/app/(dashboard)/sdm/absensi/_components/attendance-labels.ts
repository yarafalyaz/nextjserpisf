/**
 * Label Bahasa Indonesia untuk status absensi.
 *
 * Sengaja LOKAL, bukan `STATUS_LABELS` umum di `src/lib/utils/status-labels.ts`:
 * peta umum memakai kata yang berbeda (`present` → "Hadir", `absent` → "Tidak
 * Hadir") dan TIDAK memuat `permission` sama sekali, sehingga enum mentah
 * ("permission") akan tampil apa adanya ke pemakai. Absensi punya kosa kata
 * sendiri (absent = "Tanpa Keterangan", permission = "Izin"), dan memakai satu
 * peta lokal membuat keenam nilai yang diterima `attendanceSchema` pasti punya
 * label — tidak ada jalur yang bisa menampilkan enum mentah.
 */
export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  present: "Dihadir",
  late: "Terlambat",
  absent: "Tanpa Keterangan",
  sick: "Sakit",
  leave: "Cuti",
  permission: "Izin",
}

/** Warna chip per status; bentuknya sama dengan `Tone` di `StatusChip`. */
export type AttendanceStatusTone = "success" | "warning" | "danger" | "default" | "accent"

export const ATTENDANCE_STATUS_TONES: Record<string, AttendanceStatusTone> = {
  present: "success",
  late: "warning",
  absent: "danger",
  sick: "accent",
  leave: "default",
  permission: "warning",
}

/** Label status absensi; nilai tak dikenal dikembalikan apa adanya (jangan disembunyikan). */
export function attendanceStatusLabel(status: string): string {
  return ATTENDANCE_STATUS_LABELS[status] ?? status
}

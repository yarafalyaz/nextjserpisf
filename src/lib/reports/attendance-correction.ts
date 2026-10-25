/**
 * Builder murni pengajuan koreksi absensi (F-2026-10-25-010-S, putusan Lead
 * Q-AC-1/2/3 2026-10-26). Tanpa Prisma: jendela pengajuan, deteksi konflik
 * snapshot EC-1, dan bentuk baris antrean putusan (snapshot vs rekod TERKINI
 * vs usulan) diputus di sini supaya bisa difalsifikasi tanpa DB.
 *
 * Aturan kunci:
 * - Q-AC-1: tanggal koreksi >= tanggal 1 bulan lalu WIB dan <= hari ini WIB.
 * - EC-1: rekod induk berubah sesudah snapshot pengajuan = konflik; persetujuan
 *   ditolak saat itu dan pengajuan TETAP pending (bukan rejected-final).
 * - Loader putusan wajib menampilkan nilai berjalan TERKINI di samping usulan
 *   + snapshot, supaya penyetuju tidak menimpa diam-diam.
 */

export type AttendanceCorrectionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"

export interface AttendanceSnapshotLike {
  snapshotAttendanceId: number | null
  snapshotUpdatedAt: Date | null
  snapshotStatus: string | null
  snapshotCheckIn: Date | null
  snapshotCheckOut: Date | null
  snapshotNotes: string | null
}

export interface AttendanceCurrentLike {
  id: number
  updatedAt: Date
  status: string
  checkIn: Date | null
  checkOut: Date | null
  notes: string | null
}

export interface AttendanceCorrectionRowInput extends AttendanceSnapshotLike {
  id: number
  employeeId: number
  employeeName: string | null
  date: Date
  proposedStatus: string
  proposedCheckIn: Date | null
  proposedCheckOut: Date | null
  proposedNotes: string | null
  reason: string
  status: string
  approvedBy: number | null
  approvedAt: Date | null
  rejectionReason: string | null
  createdAt: Date
  /** Rekod Attendance TERKINI untuk (employeeId, date); null = belum ada. */
  current: AttendanceCurrentLike | null
}

export interface AttendanceCorrectionRow extends AttendanceCorrectionRowInput {
  /** true bila rekod terkini beda dari snapshot pengajuan (EC-1). */
  hasConflict: boolean
}

export interface AttendanceCorrectionQueue {
  rows: AttendanceCorrectionRow[]
  totals: {
    total: number
    pending: number
    approved: number
    rejected: number
    cancelled: number
    conflictedPending: number
  }
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a == null || b == null) return a == null && b == null
  return a.getTime() === b.getTime()
}

/**
 * EC-1: konflik bila keberadaan rekod berubah, rekod diganti (id beda), atau
 * nilai berjalan (updatedAt/status/jam/catatan) beda dari snapshot pengajuan.
 */
export function attendanceCorrectionHasConflict(
  snapshot: AttendanceSnapshotLike,
  current: AttendanceCurrentLike | null,
): boolean {
  if (snapshot.snapshotAttendanceId == null) return current != null
  if (current == null) return true
  if (current.id !== snapshot.snapshotAttendanceId) return true
  return !(
    sameInstant(snapshot.snapshotUpdatedAt, current.updatedAt) &&
    snapshot.snapshotStatus === current.status &&
    sameInstant(snapshot.snapshotCheckIn, current.checkIn) &&
    sameInstant(snapshot.snapshotCheckOut, current.checkOut) &&
    (snapshot.snapshotNotes ?? null) === (current.notes ?? null)
  )
}

/**
 * Jendela Q-AC-1 dalam kalender WIB. `dateUtcMidnight` = tengah malam UTC
 * hari kalender WIB (konvensi Attendance.date); `now` dipecah ke kalender
 * WIB lewat offset +7 (konvensi attendance-time.ts).
 */
export function isWithinAttendanceCorrectionWindow(
  dateUtcMidnight: Date,
  now: Date = new Date(),
): boolean {
  const wib = new Date(now.getTime() + 7 * 3_600_000)
  const todayUtc = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate())
  const windowStartUtc = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - 1, 1)
  const t = dateUtcMidnight.getTime()
  return t >= windowStartUtc && t <= todayUtc
}

export const ATTENDANCE_CORRECTION_WINDOW_MESSAGE =
  "Tanggal koreksi di luar jendela pengajuan (paling awal tanggal 1 bulan lalu, paling akhir hari ini)"

export const ATTENDANCE_CORRECTION_CONFLICT_MESSAGE =
  "Rekod absensi berubah sesudah pengajuan dibuat — persetujuan ditolak agar tidak menimpa perubahan terbaru. Pengajuan tetap menunggu; pengaju dapat membatalkan lalu mengajukan ulang."

export const ATTENDANCE_CORRECTION_FINAL_PAYROLL_MESSAGE =
  "Persetujuan ditahan: tanggal ini sudah masuk slip gaji final — menunggu jalur slip koreksi"

export function buildAttendanceCorrectionQueue(
  inputs: AttendanceCorrectionRowInput[],
): AttendanceCorrectionQueue {
  const rows = inputs.map((input) => ({
    ...input,
    hasConflict: attendanceCorrectionHasConflict(input, input.current),
  }))
  return {
    rows,
    totals: {
      total: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      conflictedPending: rows.filter((r) => r.status === "pending" && r.hasConflict).length,
    },
  }
}

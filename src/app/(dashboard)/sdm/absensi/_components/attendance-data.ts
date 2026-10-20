import { prisma } from "@/lib/db/prisma"
import { hrEmployeeScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import { wibMinutesOfDay } from "@/lib/utils/attendance-time"

/**
 * Helper server bersama halaman daftar, tambah, dan ubah absensi:
 * konversi waktu WIB serta daftar karyawan aktif dalam jangkauan pengguna.
 * Konvensi waktu: `attendance.date` adalah tengah malam UTC untuk hari
 * kalender WIB, sedangkan `checkIn`/`checkOut` adalah instan UTC dari jam
 * dinding WIB.
 */

/** Instan UTC → jam dinding WIB `HH:MM`. */
export function wibTimeLabel(instant: Date | null): string {
  if (!instant) return "-"
  const minutes = wibMinutesOfDay(instant)
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0")
  const rest = String(minutes % 60).padStart(2, "0")
  return `${hours}:${rest}`
}

/**
 * `attendance.date` (tengah malam UTC hari WIB) → `YYYY-MM-DD`.
 * Komponen UTC dari nilai ini MEMANG tanggal WIB-nya; mengambil komponen
 * lokal akan menggeser hari saat server berjalan di barat UTC.
 */
export function wibDateInputValue(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

/** Karyawan aktif dalam jangkauan pengguna, untuk dropdown formulir. */
export async function getAttendanceEmployeeOptions(scope: HrScope) {
  return prisma.employee.findMany({
    where: { isActive: true, deletedAt: null, ...hrEmployeeScopeWhere(scope) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeNo: true },
  })
}

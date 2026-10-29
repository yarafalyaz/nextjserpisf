/**
 * Loader read-only roster karyawan (EmployeeRoster) per rentang tanggal.
 *
 * Konsumen produk PERTAMA model roster (FK baru migrasi
 * 20261029173955_roster_fk): halaman roster / papan beban BELUM dibuat
 * ronde ini, jadi loader ini satu-satunya jalur baca nyata — cukup
 * findMany by employee/date range, tanpa tulis, tanpa UI.
 *
 * Izin ditegakkan pemanggil (pola attendance-recap-data: loader
 * menerima filter yang sudah diputus server, tidak menebak scope).
 */

import { prisma } from "@/lib/db/prisma"

export interface EmployeeRosterFilters {
  /** Batasi ke satu karyawan; kosong = semua karyawan. */
  employeeId?: number | null
  /** Awal rentang (inklusif) menurut kolom `date` roster. */
  dateFrom: Date
  /** Akhir rentang (inklusif) menurut kolom `date` roster. */
  dateTo: Date
  /** Batasi status roster (draft|approved|…); kosong = semua status. */
  status?: string | null
}

export interface EmployeeRosterRow {
  id: number
  employeeId: number
  employeeName: string
  date: Date
  type: string
  status: string
  notes: string | null
  approvedBy: number | null
  approvedAt: Date | null
}

export async function loadEmployeeRoster(
  filters: EmployeeRosterFilters,
): Promise<EmployeeRosterRow[]> {
  const rows = await prisma.employeeRoster.findMany({
    where: {
      date: { gte: filters.dateFrom, lte: filters.dateTo },
      ...(filters.employeeId != null ? { employeeId: filters.employeeId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      date: true,
      type: true,
      status: true,
      notes: true,
      approvedBy: true,
      approvedAt: true,
      employee: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { employeeId: "asc" }, { id: "asc" }],
  })
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    date: row.date,
    type: row.type,
    status: row.status,
    notes: row.notes,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
  }))
}

/**
 * Loader antrean pengajuan koreksi absensi (F-2026-10-25-010-S, putusan Lead
 * Q-AC-1/2/3 2026-10-26). Baca-saja: nol tulis Attendance/AttendanceCorrection.
 *
 * Scope HR fail-closed diterapkan pemanggil lewat `hrScopeWhere` pada query
 * pengajuan; loader tidak pernah memperluasnya. Rekod Attendance TERKINI
 * dimuat massal per pasangan unik (employeeId, date) — satu query, tanpa N+1 —
 * supaya layar putusan menampilkan nilai berjalan terkini di samping snapshot
 * pengajuan + usulan (penegasan Lead EC-1: tidak menimpa diam-diam).
 */

import { prisma } from "@/lib/db/prisma"
import { hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildAttendanceCorrectionQueue,
  type AttendanceCorrectionQueue,
} from "@/lib/reports/attendance-correction"

export async function loadAttendanceCorrections(
  scope: HrScope,
  filters: { status?: string } = {},
): Promise<AttendanceCorrectionQueue> {
  const rows = await prisma.attendanceCorrection.findMany({
    where: {
      ...hrScopeWhere(scope),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      employeeId: true,
      date: true,
      proposedStatus: true,
      proposedCheckIn: true,
      proposedCheckOut: true,
      proposedNotes: true,
      reason: true,
      status: true,
      snapshotAttendanceId: true,
      snapshotUpdatedAt: true,
      snapshotStatus: true,
      snapshotCheckIn: true,
      snapshotCheckOut: true,
      snapshotNotes: true,
      approvedBy: true,
      approvedAt: true,
      rejectionReason: true,
      createdAt: true,
      employee: { select: { name: true } },
    },
  })

  const employeeIds = [...new Set(rows.map((r) => r.employeeId))]
  const attendances = employeeIds.length
    ? await prisma.attendance.findMany({
        where: { employeeId: { in: employeeIds } },
        select: {
          id: true,
          employeeId: true,
          date: true,
          updatedAt: true,
          status: true,
          checkIn: true,
          checkOut: true,
          notes: true,
        },
      })
    : []
  const currentByKey = new Map(
    attendances.map((a) => [`${a.employeeId}|${a.date.getTime()}`, a]),
  )

  return buildAttendanceCorrectionQueue(
    rows.map((r) => {
      const current = currentByKey.get(`${r.employeeId}|${r.date.getTime()}`) ?? null
      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee?.name ?? null,
        date: r.date,
        proposedStatus: r.proposedStatus,
        proposedCheckIn: r.proposedCheckIn,
        proposedCheckOut: r.proposedCheckOut,
        proposedNotes: r.proposedNotes,
        reason: r.reason,
        status: r.status,
        snapshotAttendanceId: r.snapshotAttendanceId,
        snapshotUpdatedAt: r.snapshotUpdatedAt,
        snapshotStatus: r.snapshotStatus,
        snapshotCheckIn: r.snapshotCheckIn,
        snapshotCheckOut: r.snapshotCheckOut,
        snapshotNotes: r.snapshotNotes,
        approvedBy: r.approvedBy,
        approvedAt: r.approvedAt,
        rejectionReason: r.rejectionReason,
        createdAt: r.createdAt,
        current: current
          ? {
              id: current.id,
              updatedAt: current.updatedAt,
              status: current.status,
              checkIn: current.checkIn,
              checkOut: current.checkOut,
              notes: current.notes,
            }
          : null,
      }
    }),
  )
}

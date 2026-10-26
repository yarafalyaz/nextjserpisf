import { describe, expect, it } from "vitest"

import {
  attendanceCorrectionHasConflict,
  buildAttendanceCorrectionQueue,
  isWithinAttendanceCorrectionWindow,
  type AttendanceCorrectionRowInput,
} from "../attendance-correction"

const snapshotBase = {
  snapshotAttendanceId: 10,
  snapshotUpdatedAt: new Date("2026-10-20T01:00:00.000Z"),
  snapshotStatus: "present",
  snapshotCheckIn: new Date("2026-10-20T01:05:00.000Z"),
  snapshotCheckOut: null,
  snapshotNotes: null,
}

const currentBase = {
  id: 10,
  updatedAt: new Date("2026-10-20T01:00:00.000Z"),
  status: "present",
  checkIn: new Date("2026-10-20T01:05:00.000Z"),
  checkOut: null,
  notes: null,
}

function row(p: Partial<AttendanceCorrectionRowInput>): AttendanceCorrectionRowInput {
  return {
    id: 1,
    employeeId: 7,
    employeeName: "Budi",
    date: new Date(Date.UTC(2026, 9, 20)),
    proposedStatus: "present",
    proposedCheckIn: new Date("2026-10-20T01:00:00.000Z"),
    proposedCheckOut: new Date("2026-10-20T10:00:00.000Z"),
    proposedNotes: null,
    reason: "Lupa absen pulang",
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    createdAt: new Date("2026-10-21T01:00:00.000Z"),
    current: { ...currentBase },
    ...snapshotBase,
    ...p,
  }
}

describe("attendanceCorrectionHasConflict (EC-1)", () => {
  it("identik snapshot = tanpa konflik", () => {
    expect(attendanceCorrectionHasConflict(snapshotBase, { ...currentBase })).toBe(false)
  })

  it("rekod diedit petugas sesudah pengajuan = konflik", () => {
    expect(
      attendanceCorrectionHasConflict(snapshotBase, {
        ...currentBase,
        updatedAt: new Date("2026-10-21T01:00:00.000Z"),
        status: "late",
      }),
    ).toBe(true)
  })

  it("snapshot kosong lalu rekod dibuat petugas = konflik", () => {
    expect(
      attendanceCorrectionHasConflict(
        {
          snapshotAttendanceId: null,
          snapshotUpdatedAt: null,
          snapshotStatus: null,
          snapshotCheckIn: null,
          snapshotCheckOut: null,
          snapshotNotes: null,
        },
        { ...currentBase },
      ),
    ).toBe(true)
  })

  it("snapshot ada lalu rekod dihapus = konflik; snapshot kosong + tetap kosong = aman", () => {
    expect(attendanceCorrectionHasConflict(snapshotBase, null)).toBe(true)
    expect(
      attendanceCorrectionHasConflict(
        {
          snapshotAttendanceId: null,
          snapshotUpdatedAt: null,
          snapshotStatus: null,
          snapshotCheckIn: null,
          snapshotCheckOut: null,
          snapshotNotes: null,
        },
        null,
      ),
    ).toBe(false)
  })
})

describe("isWithinAttendanceCorrectionWindow (Q-AC-1)", () => {
  // 26 Okt 2026 02:00 UTC = 09:00 WIB -> jendela 1 Sep 2026..26 Okt 2026.
  const now = new Date("2026-10-26T02:00:00.000Z")
  it("tanggal 1 bulan lalu + hari ini lolos; bulan lalu-1 + besok ditolak", () => {
    expect(isWithinAttendanceCorrectionWindow(new Date(Date.UTC(2026, 8, 1)), now)).toBe(true)
    expect(isWithinAttendanceCorrectionWindow(new Date(Date.UTC(2026, 9, 26)), now)).toBe(true)
    expect(isWithinAttendanceCorrectionWindow(new Date(Date.UTC(2026, 7, 31)), now)).toBe(false)
    expect(isWithinAttendanceCorrectionWindow(new Date(Date.UTC(2026, 9, 27)), now)).toBe(false)
  })

  it("batas WIB: 25 Okt 17:30 UTC = 26 Okt 00:30 WIB, hari ini tetap 26", () => {
    const earlyWib = new Date("2026-10-25T17:30:00.000Z")
    expect(isWithinAttendanceCorrectionWindow(new Date(Date.UTC(2026, 9, 26)), earlyWib)).toBe(true)
    expect(isWithinAttendanceCorrectionWindow(new Date(Date.UTC(2026, 9, 27)), earlyWib)).toBe(false)
  })
})

describe("buildAttendanceCorrectionQueue", () => {
  it("menandai konflik hanya di baris pending berubah + total per status", () => {
    const q = buildAttendanceCorrectionQueue([
      row({}),
      row({
        id: 2,
        current: { ...currentBase, updatedAt: new Date("2026-10-22T01:00:00.000Z") },
      }),
      row({ id: 3, status: "approved", current: null, snapshotAttendanceId: null, snapshotUpdatedAt: null, snapshotStatus: null, snapshotCheckIn: null, snapshotCheckOut: null }),
    ])
    expect(q.rows.map((r) => r.hasConflict)).toEqual([false, true, false])
    expect(q.totals).toEqual({
      total: 3,
      pending: 2,
      approved: 1,
      rejected: 0,
      cancelled: 0,
      conflictedPending: 1,
    })
  })
})

import { describe, it, expect } from "vitest"
import { closedWorkOrderError, timesheetContextError } from "../timesheet-context"

// F-2026-10-21-019: penjaga konteks timesheet (proyek XOR perintah kerja).
describe("timesheetContextError (F-2026-10-21-019)", () => {
  it("konteks proyek saja sah", () => {
    expect(timesheetContextError({ projectId: 3 })).toBeNull()
  })

  it("konteks perintah kerja saja sah", () => {
    expect(timesheetContextError({ workOrderId: 7 })).toBeNull()
  })

  it("keduanya terisi ditolak", () => {
    expect(timesheetContextError({ projectId: 3, workOrderId: 7 })).toContain("tepat satu")
  })

  it("keduanya kosong ditolak", () => {
    expect(timesheetContextError({})).toContain("tepat satu")
    expect(timesheetContextError({ projectId: null, workOrderId: null })).toContain("tepat satu")
  })

  it("taskId pada konteks WO ditolak, pada konteks proyek sah", () => {
    expect(timesheetContextError({ workOrderId: 7, taskId: 9 })).toContain("Tugas")
    expect(timesheetContextError({ projectId: 3, taskId: 9 })).toBeNull()
  })
})

describe("closedWorkOrderError (F-2026-10-21-019)", () => {
  it("completed/cancelled ditolak dengan status disebut", () => {
    expect(closedWorkOrderError("completed", "dicatat")).toContain("completed")
    expect(closedWorkOrderError("cancelled", "ditarik")).toContain("cancelled")
  })

  // F-2026-10-24-097-S S1 (AC-CLOSE-1): WO closed menolak timesheet.
  // Falsifikasi: hapus "closed" dari guard -> tes ini MERAH.
  it("closed ditolak menyebut closed (S1 F-097-S)", () => {
    expect(closedWorkOrderError("closed", "dicatat")).toContain("closed")
    expect(closedWorkOrderError("closed", "ditarik")).toContain("closed")
  })

  it("status aktif sah", () => {
    for (const s of ["draft", "pending", "in_progress"]) {
      expect(closedWorkOrderError(s, "dicatat")).toBeNull()
      expect(closedWorkOrderError(s, "ditarik")).toBeNull()
    }
  })
})

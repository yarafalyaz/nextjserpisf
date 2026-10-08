import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for the QC handover gate (PRD FAB-11/FAB-13). A work order must be
// blocked from completion when there is an open nonconformance or when the
// latest final inspection did not pass. A WO with NO QC records passes (opt-in
// QC) so simple/legacy jobs remain completable.

const nonconformanceCountMock = vi.fn()
const qcInspectionFindManyMock = vi.fn()

const client = {
  nonconformance: { count: (...a: unknown[]) => nonconformanceCountMock(...a) },
  qcInspection: { findMany: (...a: unknown[]) => qcInspectionFindManyMock(...a) },
}

import { assertWorkOrderQcCleared } from "@/lib/services/qc.service"

beforeEach(() => {
  nonconformanceCountMock.mockReset()
  qcInspectionFindManyMock.mockReset()
})

describe("assertWorkOrderQcCleared", () => {
  it("blocks when an open NCR exists", async () => {
    nonconformanceCountMock.mockResolvedValue(1)

    await expect(assertWorkOrderQcCleared(7, client as never)).rejects.toThrow(/nonconformance/i)
    // Must not bother checking inspections once an NCR already blocks.
    expect(qcInspectionFindManyMock).not.toHaveBeenCalled()
  })

  it("scopes the NCR check to the work order and open statuses", async () => {
    nonconformanceCountMock.mockResolvedValue(0)
    qcInspectionFindManyMock.mockResolvedValue([])

    await assertWorkOrderQcCleared(7, client as never)

    const arg = nonconformanceCountMock.mock.calls[0][0]
    expect(arg.where.referenceType).toBe("WorkOrder")
    expect(arg.where.referenceId).toBe(7)
    expect(arg.where.status.in).toEqual(["open", "rework", "rejected"])
  })

  it("blocks when the latest final inspection failed", async () => {
    nonconformanceCountMock.mockResolvedValue(0)
    qcInspectionFindManyMock.mockResolvedValue([
      { id: 3, status: "failed" },
      { id: 2, status: "passed" },
    ])

    await expect(assertWorkOrderQcCleared(7, client as never)).rejects.toThrow(/failed|passed/i)
  })

  it("passes when the latest final inspection passed", async () => {
    nonconformanceCountMock.mockResolvedValue(0)
    qcInspectionFindManyMock.mockResolvedValue([{ id: 3, status: "passed" }])

    await expect(assertWorkOrderQcCleared(7, client as never)).resolves.toBeUndefined()
  })

  it("passes when there are no QC records at all (opt-in QC)", async () => {
    nonconformanceCountMock.mockResolvedValue(0)
    qcInspectionFindManyMock.mockResolvedValue([])

    await expect(assertWorkOrderQcCleared(7, client as never)).resolves.toBeUndefined()
  })

  it("only considers final inspections (ignores incoming/in-process)", async () => {
    nonconformanceCountMock.mockResolvedValue(0)
    qcInspectionFindManyMock.mockResolvedValue([])

    await assertWorkOrderQcCleared(7, client as never)

    const arg = qcInspectionFindManyMock.mock.calls[0][0]
    expect(arg.where.inspectionType).toBe("final")
    expect(arg.where.referenceType).toBe("WorkOrder")
    expect(arg.where.referenceId).toBe(7)
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for the QC handover gate (PRD FAB-11/FAB-13). A work order must be
// blocked from completion when there is an open nonconformance or when the
// latest final inspection did not pass. A WO with NO QC records passes (opt-in
// QC) so simple/legacy jobs remain completable.

const nonconformanceCountMock = vi.fn()
const qcInspectionFindManyMock = vi.fn()
const qcInspectionFindUniqueMock = vi.fn()
const nonconformanceFindManyMock = vi.fn()
const nonconformanceCreateMock = vi.fn()
const generateDocumentNumberMock = vi.fn()

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocumentNumberMock(...a),
}))

const client = {
  nonconformance: {
    count: (...a: unknown[]) => nonconformanceCountMock(...a),
    findMany: (...a: unknown[]) => nonconformanceFindManyMock(...a),
    create: (...a: unknown[]) => nonconformanceCreateMock(...a),
  },
  qcInspection: {
    findMany: (...a: unknown[]) => qcInspectionFindManyMock(...a),
    findUnique: (...a: unknown[]) => qcInspectionFindUniqueMock(...a),
  },
}

import {
  assertWorkOrderQcCleared,
  raiseNonconformanceFromInspection,
} from "@/lib/services/qc.service"

beforeEach(() => {
  nonconformanceCountMock.mockReset()
  qcInspectionFindManyMock.mockReset()
  qcInspectionFindUniqueMock.mockReset()
  nonconformanceFindManyMock.mockReset()
  nonconformanceCreateMock.mockReset()
  generateDocumentNumberMock.mockReset()
  nonconformanceFindManyMock.mockResolvedValue([])
  generateDocumentNumberMock.mockResolvedValue("NCR-0001")
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

describe("raiseNonconformanceFromInspection", () => {
  it("creates one NCR per failed item on a failed inspection", async () => {
    qcInspectionFindUniqueMock.mockResolvedValue({
      id: 21,
      documentNo: "QCI-0001",
      referenceType: "WorkOrder",
      referenceId: 9,
      status: "failed",
      results: [
        { checklistItem: { itemName: "Tebal cat", spec: "min 80µm" } },
        { checklistItem: { itemName: "Torsi baut", spec: null } },
      ],
    })
    nonconformanceFindManyMock.mockResolvedValue([])
    nonconformanceCreateMock
      .mockResolvedValueOnce({ id: 101 })
      .mockResolvedValueOnce({ id: 102 })

    const ids = await raiseNonconformanceFromInspection(21, client as never, 5)

    expect(ids).toEqual([101, 102])
    expect(nonconformanceCreateMock).toHaveBeenCalledTimes(2)
    const first = nonconformanceCreateMock.mock.calls[0][0]
    expect(first.data.inspectionId).toBe(21)
    expect(first.data.referenceType).toBe("WorkOrder")
    expect(first.data.referenceId).toBe(9)
    expect(first.data.status).toBe("open")
    expect(first.data.severity).toBe("major")
    expect(first.data.createdBy).toBe(5)
    expect(first.data.defectDescription).toContain("Tebal cat")
    expect(first.data.defectDescription).toContain("min 80µm")
  })

  it("is a no-op for a passed inspection", async () => {
    qcInspectionFindUniqueMock.mockResolvedValue({
      id: 21, documentNo: "QCI-0001", referenceType: "WorkOrder", referenceId: 9,
      status: "passed", results: [{ checklistItem: { itemName: "x", spec: null } }],
    })

    const ids = await raiseNonconformanceFromInspection(21, client as never, 5)

    expect(ids).toEqual([])
    expect(nonconformanceCreateMock).not.toHaveBeenCalled()
  })

  it("does not duplicate an NCR that already exists for the same defect", async () => {
    qcInspectionFindUniqueMock.mockResolvedValue({
      id: 21, documentNo: "QCI-0001", referenceType: "WorkOrder", referenceId: 9,
      status: "failed",
      results: [{ checklistItem: { itemName: "Tebal cat", spec: null } }],
    })
    nonconformanceFindManyMock.mockResolvedValue([
      { defectDescription: "Tebal cat gagal inspeksi QCI-0001" },
    ])

    const ids = await raiseNonconformanceFromInspection(21, client as never, 5)

    expect(ids).toEqual([])
    expect(nonconformanceCreateMock).not.toHaveBeenCalled()
  })

  it("is a no-op when the inspection does not exist", async () => {
    qcInspectionFindUniqueMock.mockResolvedValue(null)

    const ids = await raiseNonconformanceFromInspection(999, client as never, 5)

    expect(ids).toEqual([])
    expect(nonconformanceCreateMock).not.toHaveBeenCalled()
  })
})

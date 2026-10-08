import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression tests for the QC module (PRD FAB-10/FAB-11/FAB-13):
//  1. createQcInspection derives failed/passed from results and refuses to run
//     against a non-released checklist or with missing required items.
//  2. releaseQcChecklist rejects an empty checklist and uses an atomic claim.
//  3. deleteQcChecklist is limited to drafts that no inspection used.
//  4. resolveNonconformance refuses a closed NCR and stamps closedAt on close.
//  5. completeWorkOrder is blocked by the QC gate.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const generateDocumentNumberMock = vi.fn()
const assertWorkOrderQcClearedMock = vi.fn()
const raiseNcrFromInspectionMock = vi.fn()

const qcChecklistFindUniqueMock = vi.fn()
const qcChecklistCreateMock = vi.fn()
const qcChecklistUpdateManyMock = vi.fn()
const qcChecklistDeleteMock = vi.fn()
const qcInspectionCreateMock = vi.fn()
const nonconformanceFindUniqueMock = vi.fn()
const nonconformanceCreateMock = vi.fn()
const nonconformanceUpdateMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocumentNumberMock(...a),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/services/qc.service", () => ({
  assertWorkOrderQcCleared: (...a: unknown[]) => assertWorkOrderQcClearedMock(...a),
  raiseNonconformanceFromInspection: (...a: unknown[]) => raiseNcrFromInspectionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => {
  const prisma: Record<string, unknown> = {
    qcChecklist: {
      findUnique: (...a: unknown[]) => qcChecklistFindUniqueMock(...a),
      create: (...a: unknown[]) => qcChecklistCreateMock(...a),
      updateMany: (...a: unknown[]) => qcChecklistUpdateManyMock(...a),
      delete: (...a: unknown[]) => qcChecklistDeleteMock(...a),
    },
    qcInspection: { create: (...a: unknown[]) => qcInspectionCreateMock(...a) },
    nonconformance: {
      findUnique: (...a: unknown[]) => nonconformanceFindUniqueMock(...a),
      create: (...a: unknown[]) => nonconformanceCreateMock(...a),
      update: (...a: unknown[]) => nonconformanceUpdateMock(...a),
    },
    workOrder: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 1, status: "in_progress", items: [{ id: 1 }],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    workOrderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    materialIssue: { findFirst: vi.fn().mockResolvedValue({ id: 1 }) },
    deliveryOrder: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  }
  prisma.$transaction = vi.fn((cb: unknown) =>
    typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prisma) : Promise.all(cb as unknown[]),
  )
  return { prisma }
})

import {
  createQcInspection,
  releaseQcChecklist,
  deleteQcChecklist,
  resolveNonconformance,
} from "../qc.actions"
import { completeWorkOrder } from "../manufacturing.actions"

function fd(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) if (v != null) f.append(k, String(v))
  return f
}

function inspectionForm(over: {
  checklistId?: number
  rows?: { id: number; result: string }[]
} = {}): FormData {
  const f = fd({
    checklistId: over.checklistId ?? 5,
    inspectionType: "final",
    referenceType: "WorkOrder",
    referenceId: 9,
  })
  for (const r of over.rows ?? []) {
    f.append("resultItemId", String(r.id))
    f.append("resultValue", r.result)
  }
  return f
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, generateDocumentNumberMock,
    assertWorkOrderQcClearedMock, qcChecklistFindUniqueMock, qcChecklistCreateMock,
    qcChecklistUpdateManyMock, qcChecklistDeleteMock, qcInspectionCreateMock,
    nonconformanceFindUniqueMock, nonconformanceCreateMock, nonconformanceUpdateMock,
    raiseNcrFromInspectionMock,
  ]) m.mockReset()

  requirePermissionMock.mockResolvedValue({ id: 5 })
  generateDocumentNumberMock.mockResolvedValue("QCI-0001")
  assertWorkOrderQcClearedMock.mockResolvedValue(undefined)
  raiseNcrFromInspectionMock.mockResolvedValue([])
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("createQcInspection", () => {
  it("derives 'passed' when no result fails", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({
      id: 5, status: "released",
      items: [{ id: 1, isRequired: true }, { id: 2, isRequired: true }],
    })
    qcInspectionCreateMock.mockResolvedValue({ id: 20 })

    const res = await createQcInspection(inspectionForm({ rows: [{ id: 1, result: "pass" }, { id: 2, result: "pass" }] }))

    expect(res.success).toBe(true)
    expect(res.status).toBe("passed")
    const arg = qcInspectionCreateMock.mock.calls[0][0]
    expect(arg.data.status).toBe("passed")
    expect(arg.data.results.create).toHaveLength(2)
  })

  it("derives 'failed' when any result fails", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({
      id: 5, status: "released",
      items: [{ id: 1, isRequired: true }, { id: 2, isRequired: true }],
    })
    qcInspectionCreateMock.mockResolvedValue({ id: 21 })

    const res = await createQcInspection(inspectionForm({ rows: [{ id: 1, result: "pass" }, { id: 2, result: "fail" }] }))

    expect(res.success).toBe(true)
    expect(res.status).toBe("failed")
  })

  it("auto-raises NCRs from a failed inspection", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({
      id: 5, status: "released",
      items: [{ id: 1, isRequired: true }, { id: 2, isRequired: true }],
    })
    qcInspectionCreateMock.mockResolvedValue({ id: 21 })
    raiseNcrFromInspectionMock.mockResolvedValue([101, 102])

    const res = await createQcInspection(inspectionForm({ rows: [{ id: 1, result: "fail" }, { id: 2, result: "fail" }] }))

    expect(res.success).toBe(true)
    expect(res.status).toBe("failed")
    // Auto-raise must run in the same transaction that created the inspection.
    expect(raiseNcrFromInspectionMock).toHaveBeenCalledWith(21, expect.anything(), 5)
    expect(res.raisedNcrIds).toEqual([101, 102])
  })

  it("does NOT auto-raise NCRs when the inspection passes", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({
      id: 5, status: "released",
      items: [{ id: 1, isRequired: true }],
    })
    qcInspectionCreateMock.mockResolvedValue({ id: 22 })

    const res = await createQcInspection(inspectionForm({ rows: [{ id: 1, result: "pass" }] }))

    expect(res.success).toBe(true)
    expect(res.status).toBe("passed")
    expect(raiseNcrFromInspectionMock).not.toHaveBeenCalled()
    expect(res.raisedNcrIds).toEqual([])
  })

  it("refuses a non-released checklist", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({
      id: 5, status: "draft", items: [{ id: 1, isRequired: true }],
    })

    const res = await createQcInspection(inspectionForm({ rows: [{ id: 1, result: "pass" }] }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("dirilis")
    expect(qcInspectionCreateMock).not.toHaveBeenCalled()
  })

  it("refuses when a required item is unanswered", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({
      id: 5, status: "released",
      items: [{ id: 1, isRequired: true }, { id: 2, isRequired: true }],
    })

    const res = await createQcInspection(inspectionForm({ rows: [{ id: 1, result: "pass" }] }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("wajib")
    expect(qcInspectionCreateMock).not.toHaveBeenCalled()
  })

  it("drops results that reference items not on the checklist", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({
      id: 5, status: "released",
      items: [{ id: 1, isRequired: true }],
    })
    qcInspectionCreateMock.mockResolvedValue({ id: 22 })

    const res = await createQcInspection(inspectionForm({ rows: [{ id: 1, result: "pass" }, { id: 999, result: "fail" }] }))

    expect(res.success).toBe(true)
    expect(res.status).toBe("passed")
    const arg = qcInspectionCreateMock.mock.calls[0][0]
    expect(arg.data.results.create).toHaveLength(1)
    expect(arg.data.results.create[0].checklistItemId).toBe(1)
  })
})

describe("releaseQcChecklist", () => {
  it("refuses to release an empty checklist", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({ id: 1, _count: { items: 0 } })

    const res = await releaseQcChecklist(1)

    expect(res.success).toBe(false)
    expect(res.error).toContain("kosong")
    expect(qcChecklistUpdateManyMock).not.toHaveBeenCalled()
  })

  it("releases a draft via an atomic claim", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({ id: 1, _count: { items: 3 } })
    qcChecklistUpdateManyMock.mockResolvedValue({ count: 1 })

    const res = await releaseQcChecklist(1)

    expect(res.success).toBe(true)
    const claim = qcChecklistUpdateManyMock.mock.calls[0][0]
    expect(claim.where).toEqual({ id: 1, status: "draft" })
    expect(claim.data.status).toBe("released")
  })

  it("fails when the draft claim is lost", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({ id: 1, _count: { items: 3 } })
    qcChecklistUpdateManyMock.mockResolvedValue({ count: 0 })

    const res = await releaseQcChecklist(1)

    expect(res.success).toBe(false)
  })
})

describe("deleteQcChecklist", () => {
  it("refuses to delete a non-draft checklist", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({ status: "released", _count: { inspections: 0 } })

    const res = await deleteQcChecklist(1)

    expect(res.success).toBe(false)
    expect(qcChecklistDeleteMock).not.toHaveBeenCalled()
  })

  it("refuses to delete a checklist used by an inspection", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({ status: "draft", _count: { inspections: 2 } })

    const res = await deleteQcChecklist(1)

    expect(res.success).toBe(false)
    expect(res.error).toContain("inspeksi")
    expect(qcChecklistDeleteMock).not.toHaveBeenCalled()
  })

  it("deletes an unused draft", async () => {
    qcChecklistFindUniqueMock.mockResolvedValue({ status: "draft", _count: { inspections: 0 } })
    qcChecklistDeleteMock.mockResolvedValue({})

    const res = await deleteQcChecklist(1)

    expect(res.success).toBe(true)
    expect(qcChecklistDeleteMock).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})

describe("resolveNonconformance", () => {
  it("refuses to update an already-closed NCR", async () => {
    nonconformanceFindUniqueMock.mockResolvedValue({ id: 1, status: "closed" })

    const res = await resolveNonconformance(1, fd({ status: "closed" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("ditutup")
    expect(nonconformanceUpdateMock).not.toHaveBeenCalled()
  })

  it("stamps closedAt/closedBy when closing", async () => {
    nonconformanceFindUniqueMock.mockResolvedValue({ id: 1, status: "rework" })
    nonconformanceUpdateMock.mockResolvedValue({})

    const res = await resolveNonconformance(1, fd({ status: "closed", resolution: "diperbaiki" }))

    expect(res.success).toBe(true)
    const arg = nonconformanceUpdateMock.mock.calls[0][0]
    expect(arg.data.status).toBe("closed")
    expect(arg.data.closedAt).toBeInstanceOf(Date)
    expect(arg.data.closedBy).toBe(5)
  })
})

describe("completeWorkOrder — QC gate", () => {
  it("is blocked when the QC gate throws", async () => {
    assertWorkOrderQcClearedMock.mockRejectedValue(
      new Error("Tidak dapat menyelesaikan WO: masih ada 1 nonconformance (NCR) terbuka"),
    )

    const res = await completeWorkOrder(1)

    expect(res.success).toBe(false)
    expect(res.error).toContain("nonconformance")
  })
})

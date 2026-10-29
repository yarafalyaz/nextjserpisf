import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression: deleteQuotation must not delete a Project shared by work orders
// outside this quotation. Project.workOrders is 1:N and WorkOrder.projectId is
// independent of WorkOrder.quotationId (createWorkOrder sets both from
// independent form fields), so deleting the quotation's work orders and then
// their projects wipes a sibling work order's project (FK Restrict / orphan).

const requirePermissionMock = vi.fn()
const transactionMock = vi.fn()

const tx = {
  salesOrder: { findMany: vi.fn(), deleteMany: vi.fn() },
  salesInvoice: { findMany: vi.fn(), deleteMany: vi.fn() },
  salesPayment: { deleteMany: vi.fn() },
  salesInvoiceItem: { deleteMany: vi.fn() },
  deliveryOrder: { deleteMany: vi.fn() },
  salesOrderItem: { deleteMany: vi.fn() },
  workOrder: { findMany: vi.fn(), deleteMany: vi.fn() },
  workOrderItem: { deleteMany: vi.fn() },
  project: { findMany: vi.fn(), deleteMany: vi.fn() },
  downPayment: { findMany: vi.fn(), deleteMany: vi.fn() },
  quotationSection: { findMany: vi.fn(), deleteMany: vi.fn() },
  quotationItem: { deleteMany: vi.fn() },
  quotation: { delete: vi.fn(), findUniqueOrThrow: vi.fn() },
}

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 5 }) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  deleteJournalByReferenceTx: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/sales-invoice-posting.service", () => ({
  reverseSalesInvoicePostingTx: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))

import { deleteQuotation } from "../sales.actions"

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  ;(tx.quotation.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 5, status: "draft" })
  tx.salesOrder.findMany.mockResolvedValue([])
  tx.salesInvoice.findMany.mockResolvedValue([])
  tx.downPayment.findMany.mockResolvedValue([])
  tx.quotationSection.findMany.mockResolvedValue([])
  // Quotation 5 owns WO 10 (project 7). Project 7 also hosts WO 99 of another
  // quotation: its workOrder ids inside the project are [10, 99].
  tx.workOrder.findMany.mockResolvedValue([{ id: 10, projectId: 7 }])
  // Post-delete state: WO 10 already removed, sibling WO 99 remains on project 7.
  tx.project.findMany.mockResolvedValue([
    { id: 7, workOrders: [{ id: 99 }] },
  ])
})

describe("deleteQuotation shared project guard", () => {
  it("does not delete a project still referenced by a work order outside the quotation", async () => {
    const result = await deleteQuotation(5)

    expect(result.success).toBe(true)
    // WO 10 of this quotation may go; shared project 7 must survive.
    expect(tx.workOrder.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [10] } } })
    const deletedProjectIds = (tx.project.deleteMany.mock.calls[0]?.[0]?.where?.id?.in ?? []) as number[]
    expect(deletedProjectIds).not.toContain(7)
  })

  it("still deletes a project owned only by this quotation's work orders", async () => {
    tx.project.findMany.mockResolvedValue([{ id: 7, workOrders: [] }])

    const result = await deleteQuotation(5)

    expect(result.success).toBe(true)
    expect(tx.project.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [7] } } })
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-20-10: createDifferenceInvoice membuat SalesInvoice DRAFT
 * sebesar selisih revisi. Mock mandiri meniru pola sales.actions.test.ts
 * (hoisted prisma mock, $transaction menjalankan callback dgn mock sama).
 */
const mocks = await vi.hoisted(async () => {
  const { buildModelMock } = await import("./validation-mock-helpers")
  const prismaMock: Record<string, unknown> = {
    quotation: buildModelMock({ id: 99, slug: "inv-selisih" }),
    salesOrder: buildModelMock(),
    workOrder: buildModelMock(),
    salesInvoice: buildModelMock(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
  const requirePermissionMock = vi.fn().mockResolvedValue({ id: 7 })
  return {
    prismaMock: prismaMock as {
      quotation: ReturnType<typeof buildModelMock>
      salesOrder: ReturnType<typeof buildModelMock>
      workOrder: ReturnType<typeof buildModelMock>
      salesInvoice: ReturnType<typeof buildModelMock>
      $transaction: ReturnType<typeof vi.fn>
      $queryRaw: ReturnType<typeof vi.fn>
    },
    requirePermissionMock,
    requirePermission: requirePermissionMock,
    revalidatePath: vi.fn(),
    assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn().mockResolvedValue(undefined),
    generateDocumentNumber: vi.fn().mockResolvedValue("INV-2026-001"),
  }
})

vi.mock("@/lib/db/prisma", async () => (await import("./validation-mock-helpers")).prismaFactory(mocks, "prismaMock"))
vi.mock("@/lib/auth/permissions", async () => (await import("./validation-mock-helpers")).permissionFactory(mocks))
vi.mock("next/cache", async () => (await import("./validation-mock-helpers")).revalidateFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./validation-mock-helpers")).docNumberFactory(mocks))
vi.mock("@/lib/utils/slug-db", async () => (await import("./validation-mock-helpers")).slugFixedFactory())
vi.mock("@/lib/services/period-lock.service", async () => (await import("./validation-mock-helpers")).periodLockFactory(mocks))
vi.mock("@/lib/services/activity-log.service", async () => (await import("./validation-mock-helpers")).activityLogFactory(mocks))
vi.mock("@/lib/services/approval-workflow.service", async () => (await import("./validation-mock-helpers")).approvalFactory())

import { createDifferenceInvoice } from "../sales.actions"

const revisedQuotation = {
  id: 5,
  documentNo: "QUO-2026-005",
  customerId: 3,
  customerVehicleId: 9,
  grandTotal: 1500000,
  revisionNumber: 2,
}

describe("createDifferenceInvoice (F-2026-10-20-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(revisedQuotation)
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "paid", grandTotal: 1000000 },
    ])
    mocks.prismaMock.salesInvoice.create.mockResolvedValue({ id: 99, slug: "inv-2026-001" })
  })

  it("membuat faktur DRAFT sebesar selisih positif (revisi 1,5jt − tertagih 1jt)", async () => {
    const res = await createDifferenceInvoice(5)
    expect(res.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_sales_invoices")
    const data = mocks.prismaMock.salesInvoice.create.mock.calls[0][0].data
    expect(data.status).toBe("draft")
    expect(data.grandTotal).toBe(500000)
    expect(data.quotationId).toBe(5)
    expect(data.customerVehicleId).toBe(9)
    expect(data.items.create[0].itemId).toBeNull()
    expect(data.items.create[0].total).toBe(500000)
  })

  it("menolak penawaran yang belum pernah direvisi", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue({ ...revisedQuotation, revisionNumber: 0 })
    const res = await createDifferenceInvoice(5)
    expect(res.success).toBe(false)
    expect(res.error).toContain("belum pernah direvisi")
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("menolak bila selisih sudah tertagih penuh (draft selisih sebelumnya ada)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "paid", grandTotal: 1000000 },
      { id: 12, status: "draft", grandTotal: 500000 },
    ])
    const res = await createDifferenceInvoice(5)
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah tertagih penuh")
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("menolak penawaran tidak ditemukan / terhapus", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(null)
    const res = await createDifferenceInvoice(404)
    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak ditemukan")
  })

  it("invoice cancelled tidak mengurangi selisih", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "cancelled", grandTotal: 1000000 },
    ])
    const res = await createDifferenceInvoice(5)
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.salesInvoice.create.mock.calls[0][0].data
    expect(data.grandTotal).toBe(1500000)
  })
})

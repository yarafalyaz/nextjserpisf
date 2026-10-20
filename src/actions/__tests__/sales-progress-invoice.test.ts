import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-20-10: createProgressInvoice membuat SalesInvoice DRAFT
 * sebesar selisih revisi. Mock mandiri meniru pola sales.actions.test.ts
 * (hoisted prisma mock, $transaction menjalankan callback dgn mock sama).
 */
const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 99, slug: "inv-selisih" }),
    update: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  })
  const prismaMock: Record<string, unknown> = {
    quotation: buildModelMock(),
    salesOrder: buildModelMock(),
    workOrder: buildModelMock(),
    salesInvoice: buildModelMock(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
  return {
    prismaMock: prismaMock as {
      quotation: ReturnType<typeof buildModelMock>
      salesOrder: ReturnType<typeof buildModelMock>
      workOrder: ReturnType<typeof buildModelMock>
      salesInvoice: ReturnType<typeof buildModelMock>
      $transaction: ReturnType<typeof vi.fn>
      $queryRaw: ReturnType<typeof vi.fn>
    },
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 7 }),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("INV-2026-001"),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("inv-2026-001") }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  reportPostCommitAuditFailure: vi.fn(),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(undefined),
  assertApproved: vi.fn().mockResolvedValue(undefined),
}))

import { createProgressInvoice } from "../sales.actions"

const contractQuotation = {
  id: 5,
  documentNo: "QUO-2026-005",
  customerId: 3,
  customerVehicleId: 9,
  grandTotal: 1500000,
  revisionNumber: 2,
}

describe("createProgressInvoice (F-2026-10-20-58)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(contractQuotation)
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "posted", grandTotal: 1000000 },
    ])
    mocks.prismaMock.salesInvoice.create.mockResolvedValue({ id: 99, slug: "inv-2026-001" })
  })

  it("target 100% kontrak 1,5jt, tertagih 1jt -> progres DRAFT 500rb", async () => {
    const res = await createProgressInvoice(5, 100)
    expect(res.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_sales_invoices")
    const data = mocks.prismaMock.salesInvoice.create.mock.calls[0][0].data
    expect(data.status).toBe("draft")
    expect(data.grandTotal).toBe(500000)
    expect(data.quotationId).toBe(5)
    expect(data.items.create[0].itemId).toBeNull()
  })

  it("target 40% sesudah tertagih 1jt dari 1,5jt ditolak (di bawah tertagih)", async () => {
    const res = await createProgressInvoice(5, 40)
    expect(res.success).toBe(false)
    expect(res.error).toContain("kredit revisi-turun")
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("draft ikut memesan porsi — progres porsi sama ditolak", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "draft", grandTotal: 600000 },
    ])
    const res = await createProgressInvoice(5, 40)
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah tertagih penuh")
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("persen 0 dan 101 ditolak server", async () => {
    expect((await createProgressInvoice(5, 0)).success).toBe(false)
    expect((await createProgressInvoice(5, 101)).success).toBe(false)
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("penawaran tidak ditemukan ditolak", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(null)
    const res = await createProgressInvoice(404, 50)
    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak ditemukan")
  })

  it("invoice cancelled tidak dihitung tertagih", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "cancelled", grandTotal: 1000000 },
    ])
    const res = await createProgressInvoice(5, 100)
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.salesInvoice.create.mock.calls[0][0].data
    expect(data.grandTotal).toBe(1500000)
  })
})

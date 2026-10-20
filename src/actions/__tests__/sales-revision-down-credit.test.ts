import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-20-59: createRevisionDownCredit membuat CustomerCredit pasif
 * sourceType RevisionDown sebesar kandidat builder, TANPA jurnal.
 * Mock meniru sales-difference-invoice.test.ts.
 */
const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 77, slug: "cc-1" }),
    update: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  })
  const prismaMock: Record<string, unknown> = {
    quotation: buildModelMock(),
    salesOrder: buildModelMock(),
    workOrder: buildModelMock(),
    salesInvoice: buildModelMock(),
    downPayment: buildModelMock(),
    customerCredit: buildModelMock(),
    journal: buildModelMock(),
    $queryRaw: vi.fn().mockResolvedValue([]),
  }
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
  return {
    prismaMock: prismaMock as {
      quotation: ReturnType<typeof buildModelMock>
      salesOrder: ReturnType<typeof buildModelMock>
      workOrder: ReturnType<typeof buildModelMock>
      salesInvoice: ReturnType<typeof buildModelMock>
      downPayment: ReturnType<typeof buildModelMock>
      customerCredit: ReturnType<typeof buildModelMock>
      journal: ReturnType<typeof buildModelMock>
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
  generateDocumentNumber: vi.fn().mockResolvedValue("CC-2026-001"),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn().mockResolvedValue("cc-2026-001") }))
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

import { createRevisionDownCredit } from "../sales.actions"

const revisedDown = {
  id: 5,
  documentNo: "QUO-2026-005",
  customerId: 3,
  grandTotal: 1000000,
  revisionNumber: 2,
}

describe("createRevisionDownCredit (F-2026-10-20-59)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(revisedDown)
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.downPayment.findMany.mockResolvedValue([])
    mocks.prismaMock.customerCredit.findMany.mockResolvedValue([])
    mocks.prismaMock.customerCredit.create.mockResolvedValue({ id: 77 })
    // Tertagih 1,5jt > nilai berjalan 1jt -> kelebihan 500rb.
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "posted", grandTotal: 1500000 },
    ])
  })

  it("membuat CustomerCredit RevisionDown pasif sebesar kelebihan, tanpa jurnal", async () => {
    const res = await createRevisionDownCredit(5)
    expect(res.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("confirm_down_payments")
    const data = mocks.prismaMock.customerCredit.create.mock.calls[0][0].data
    expect(data.sourceType).toBe("RevisionDown")
    expect(data.sourceId).toBe(5)
    expect(data.customerId).toBe(3)
    expect(data.receivedAmount).toBe(500000)
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
  })

  it("menolak penawaran belum pernah direvisi", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue({ ...revisedDown, revisionNumber: 0 })
    const res = await createRevisionDownCredit(5)
    expect(res.success).toBe(false)
    expect(res.error).toContain("belum pernah direvisi")
    expect(mocks.prismaMock.customerCredit.create).not.toHaveBeenCalled()
  })

  it("menolak bila tidak ada kelebihan (tertagih <= nilai berjalan)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "paid", grandTotal: 800000 },
    ])
    const res = await createRevisionDownCredit(5)
    expect(res.success).toBe(false)
    expect(res.error).toContain("Tidak ada kelebihan")
    expect(mocks.prismaMock.customerCredit.create).not.toHaveBeenCalled()
  })

  it("anti dobel: kredit RevisionDown existing mengurangi nominal baru", async () => {
    mocks.prismaMock.customerCredit.findMany
      .mockResolvedValueOnce([{ receivedAmount: 300000, allocatedAmount: 0, refundedAmount: 0 }])
      .mockResolvedValue([])
    const res = await createRevisionDownCredit(5)
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.customerCredit.create.mock.calls[0][0].data
    expect(data.receivedAmount).toBe(200000)
  })

  it("anti dobel penuh: kelebihan sudah tercatat -> ditolak", async () => {
    mocks.prismaMock.customerCredit.findMany
      .mockResolvedValueOnce([{ receivedAmount: 500000, allocatedAmount: 0, refundedAmount: 0 }])
      .mockResolvedValue([])
    const res = await createRevisionDownCredit(5)
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah tercatat")
    expect(mocks.prismaMock.customerCredit.create).not.toHaveBeenCalled()
  })

  it("invoice cancelled tidak dihitung tertagih", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "cancelled", grandTotal: 1500000 },
    ])
    const res = await createRevisionDownCredit(5)
    expect(res.success).toBe(false)
    expect(res.error).toContain("Tidak ada kelebihan")
    expect(mocks.prismaMock.customerCredit.create).not.toHaveBeenCalled()
  })

  it("menolak penawaran tidak ditemukan", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(null)
    const res = await createRevisionDownCredit(404)
    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak ditemukan")
  })
})

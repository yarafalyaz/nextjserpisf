import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-20-59: createRevisionDownCredit membuat CustomerCredit pasif
 * sourceType RevisionDown sebesar kandidat builder, TANPA jurnal.
 * Mock meniru sales-difference-invoice.test.ts.
 */
const mocks = await vi.hoisted(async () => {
  const h = await import("./validation-mock-helpers")
  const prismaMock = h.buildSalesRevisionPrismaMock({
    downPayment: h.buildModelMock(),
    customerCredit: h.buildModelMock({ id: 77, slug: "cc-1" }),
    journal: h.buildModelMock(),
  })
  return h.buildSalesRevisionMocks(prismaMock, "CC-2026-001")
})

import * as helpers from "./validation-mock-helpers"
vi.mock("@/lib/db/prisma", () => helpers.registerSalesRevisionMocks(mocks).prisma()); vi.mock("@/lib/auth/permissions", () => helpers.registerSalesRevisionMocks(mocks).permissions())
vi.mock("next/cache", () => helpers.registerSalesRevisionMocks(mocks).cache())
vi.mock("@/lib/utils/document-number", () => helpers.registerSalesRevisionMocks(mocks).docNumber()); vi.mock("@/lib/utils/slug-db", () => helpers.registerSalesRevisionMocks(mocks).slug())
vi.mock("@/lib/services/period-lock.service", () => helpers.registerSalesRevisionMocks(mocks).periodLock())
vi.mock("@/lib/services/activity-log.service", () => helpers.registerSalesRevisionMocks(mocks).activityLog())
vi.mock("@/lib/services/approval-workflow.service", () => helpers.registerSalesRevisionMocks(mocks).approval())

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
    helpers.setupSalesRevisionBase(mocks, revisedDown)
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
    helpers.expectRevisionDownRejection(mocks, res, "Tidak ada kelebihan")
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
    helpers.expectRevisionDownRejection(mocks, res, "sudah tercatat")
  })

  it("invoice cancelled tidak dihitung tertagih", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 11, status: "cancelled", grandTotal: 1500000 },
    ])
    const res = await createRevisionDownCredit(5)
    helpers.expectRevisionDownRejection(mocks, res, "Tidak ada kelebihan")
  })

  it("menolak penawaran tidak ditemukan", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(null)
    const res = await createRevisionDownCredit(404)
    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak ditemukan")
  })
})

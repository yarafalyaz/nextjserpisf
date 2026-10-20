import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-20-58: createProgressInvoice membuat SalesInvoice DRAFT
 * sebesar selisih revisi. Mock mandiri meniru pola sales.actions.test.ts
 * (hoisted prisma mock, $transaction menjalankan callback dgn mock sama).
 */
const mocks = await vi.hoisted(async () => {
  const h = await import("./validation-mock-helpers")
  const prismaMock = h.buildSalesRevisionPrismaMock()
  prismaMock.quotation = h.buildModelMock({ id: 99, slug: "inv-progres" })
  return h.buildSalesRevisionMocks(prismaMock, "PRG-2026-001")
})

import * as helpers from "./validation-mock-helpers"
vi.mock("@/lib/db/prisma", () => helpers.registerSalesRevisionMocks(mocks).prisma())
vi.mock("@/lib/auth/permissions", () => helpers.registerSalesRevisionMocks(mocks).permissions())
vi.mock("next/cache", () => helpers.registerSalesRevisionMocks(mocks).cache())
vi.mock("@/lib/utils/document-number", () => helpers.registerSalesRevisionMocks(mocks).docNumber())
vi.mock("@/lib/utils/slug-db", () => helpers.registerSalesRevisionMocks(mocks).slug())
vi.mock("@/lib/services/period-lock.service", () => helpers.registerSalesRevisionMocks(mocks).periodLock())
vi.mock("@/lib/services/activity-log.service", () => helpers.registerSalesRevisionMocks(mocks).activityLog())
vi.mock("@/lib/services/approval-workflow.service", () => helpers.registerSalesRevisionMocks(mocks).approval())

import { createProgressInvoice } from "../sales.actions"


describe("createProgressInvoice (F-2026-10-20-58)", () => {
  beforeEach(() => {
    helpers.setupSalesRevisionBase(mocks, helpers.REVISION_CONTRACT_QUOTATION)
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue(helpers.REVISION_BILLED_INVOICE)
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

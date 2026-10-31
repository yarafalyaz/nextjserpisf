import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-20-10: createDifferenceInvoice membuat SalesInvoice DRAFT
 * sebesar selisih revisi. Mock mandiri meniru pola sales.actions.test.ts
 * (hoisted prisma mock, $transaction menjalankan callback dgn mock sama).
 */
const mocks = await vi.hoisted(async () => {
  const h = await import("./validation-mock-helpers")
  const prismaMock = h.buildSalesRevisionPrismaMock()
  prismaMock.quotation = h.buildModelMock({ id: 99, slug: "inv-selisih" })
  return h.buildSalesRevisionMocks(prismaMock, "INV-2026-001")
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

import { createDifferenceInvoice } from "../sales.actions"


describe("createDifferenceInvoice (F-2026-10-20-10)", () => {
  beforeEach(() => {
    helpers.setupSalesRevisionBase(mocks, helpers.REVISION_CONTRACT_QUOTATION)
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue(helpers.REVISION_BILLED_INVOICE)
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

  it("R8-JB-09: dueDate diturunkan dari termin pelanggan; tanggal dokumen tengah malam UTC", async () => {
    mocks.prismaMock.customer.findUnique.mockResolvedValue({ paymentTerm: { days: 30, isActive: true } })
    const res = await createDifferenceInvoice(5)
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.salesInvoice.create.mock.calls[0][0].data
    expect(data.date.getUTCHours()).toBe(0)
    expect(data.dueDate.getTime() - data.date.getTime()).toBe(30 * 86_400_000)
  })

  it("R8-JB-09: pelanggan tanpa termin → dueDate null", async () => {
    mocks.prismaMock.customer.findUnique.mockResolvedValue(null)
    const res = await createDifferenceInvoice(5)
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.salesInvoice.create.mock.calls[0][0].data
    expect(data.dueDate).toBeNull()
  })

  it("menolak penawaran yang belum pernah direvisi", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue({ ...helpers.REVISION_CONTRACT_QUOTATION, revisionNumber: 0 })
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

  it("nominal dihitung dari grandTotal TERKUNCI, bukan snapshot luar tx", async () => {
    // Luar tx: kontrak 1,5jt (selisih 500rb atas tertagih 1jt). Di bawah
    // kunci: revisi lain sudah menurunkan kontrak ke 1jt -> selisih habis.
    mocks.prismaMock.quotation.findFirst
      .mockResolvedValueOnce(helpers.REVISION_CONTRACT_QUOTATION)
      .mockResolvedValueOnce({ ...helpers.REVISION_CONTRACT_QUOTATION, grandTotal: 1000000 })
    const res = await createDifferenceInvoice(5)
    expect(res.success).toBe(false)
    expect(res.error).toContain("sudah tertagih penuh")
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
    const lockSql = mocks.prismaMock.$queryRaw.mock.calls
      .map((c: unknown[]) => {
        const first = c[0] as unknown
        if (Array.isArray(first)) return (first as string[]).join("?")
        return ((first as { strings?: string[] })?.strings ?? []).join("?")
      })
      .join(" ")
    expect(lockSql).toContain("quotations")
  })
})

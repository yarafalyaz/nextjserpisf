import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue({ id: 1, name: "PT Uji" }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
  })

  const prismaMock: any = {
    customer: buildModelMock(),
    salesInvoice: buildModelMock(),
    invoiceExchangeItem: buildModelMock(),
    invoiceExchange: buildModelMock(),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    generateDocMock: vi.fn(),
    assertPeriodMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: (...a: any) => mocks.generateDocMock(...a) }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))
vi.mock("@/lib/services/period-lock.service", () => ({ assertPeriodOpen: (...a: any) => mocks.assertPeriodMock(...a) }))

import * as actions from "../invoice-exchange.actions"

function fd(payload: Record<string, string>, invoiceIds: string[] = ["10"]): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.set(k, v)
  for (const id of invoiceIds) f.append("invoiceIds", id)
  return f
}

const base = { date: "2026-10-20", customerId: "1", receiptNumber: "", dueDate: "", notes: "" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
  mocks.generateDocMock.mockResolvedValue("TKF-001")
  mocks.assertPeriodMock.mockResolvedValue(undefined)
  mocks.prismaMock.customer.findFirst.mockResolvedValue({ id: 1, name: "PT Uji" })
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
    { id: 10, documentNo: "INV-10", customerId: 1, grandTotal: 1000, status: "posted" },
  ])
  mocks.prismaMock.invoiceExchangeItem.findMany.mockResolvedValue([])
  mocks.prismaMock.invoiceExchange.create.mockResolvedValue({ id: 1 })
})

describe("createInvoiceExchange Zod validation", () => {
  it("menolak tanggal fiktif 2026-02-30, DB tidak disentuh", async () => {
    const res = await actions.createInvoiceExchange(fd({ ...base, date: "2026-02-30" }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Validasi gagal")
    expect(mocks.prismaMock.invoiceExchange.create).not.toHaveBeenCalled()
  })

  it("menolak dueDate fiktif", async () => {
    const res = await actions.createInvoiceExchange(fd({ ...base, dueDate: "2026-13-01" }))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.invoiceExchange.create).not.toHaveBeenCalled()
  })

  it("menolak receiptNumber > 255 karakter", async () => {
    const res = await actions.createInvoiceExchange(fd({ ...base, receiptNumber: "x".repeat(256) }))
    expect(res.success).toBe(false)
    expect(res.error).toContain("Validasi gagal")
    expect(mocks.prismaMock.invoiceExchange.create).not.toHaveBeenCalled()
  })

  it("menolak notes > 2000 karakter", async () => {
    const res = await actions.createInvoiceExchange(fd({ ...base, notes: "x".repeat(2001) }))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.invoiceExchange.create).not.toHaveBeenCalled()
  })

  it("menolak customerId negatif", async () => {
    const res = await actions.createInvoiceExchange(fd({ ...base, customerId: "-3" }))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.invoiceExchange.create).not.toHaveBeenCalled()
  })

  it("happy path: tanggal tersimpan tengah malam UTC", async () => {
    const res = await actions.createInvoiceExchange(fd(base))
    expect(res.success).toBe(true)
    const data = mocks.prismaMock.invoiceExchange.create.mock.calls.at(-1)![0].data
    expect(data.date.toISOString()).toBe("2026-10-20T00:00:00.000Z")
    expect(data.customerId).toBe(1)
  })
})

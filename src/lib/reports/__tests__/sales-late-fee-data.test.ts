import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(async () => ({ id: 1 })),
  prismaMock: {
    salesInvoice: { findFirst: vi.fn() },
    salesLateFee: { findMany: vi.fn() },
    customerLateFeeTerm: { findMany: vi.fn() },
    systemSetting: { findFirst: vi.fn() },
    account: { findMany: vi.fn() },
    paymentMethod: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getSalesLateFeePanelForInvoice } from "../sales-late-fee-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 1 })
  mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue({
    id: 9,
    documentNo: "INV-0009",
    customerId: 3,
    customer: { name: "PT Uji" },
  })
  mocks.prismaMock.salesLateFee.findMany.mockResolvedValue([
    {
      id: 1,
      documentNo: "LF-0001",
      date: new Date(2026, 9, 15),
      dueReferenceDate: new Date(2026, 9, 1),
      overdueDays: 14,
      basisAmount: 6_000_000,
      ratePercentPerDay: 0.1,
      flatAmountPerDay: null,
      capAmount: null,
      amount: 84_000,
      paidAmount: 34_000,
      status: "partial",
      reversesId: null,
      notes: null,
      payments: [],
    },
  ])
  mocks.prismaMock.customerLateFeeTerm.findMany.mockResolvedValue([])
  mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({
    lateFeeIncomeAccountId: null,
  })
  mocks.prismaMock.account.findMany.mockResolvedValue([])
  mocks.prismaMock.paymentMethod.findMany.mockResolvedValue([
    { code: "transfer", name: "Transfer Bank" },
  ])
})

describe("getSalesLateFeePanelForInvoice F-2026-10-22-093-V", () => {
  it("izin view_sales_late_fees ditegakkan sebelum query; saldo dari snapshot", async () => {
    const bundle = await getSalesLateFeePanelForInvoice(9)
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_sales_late_fees")
    expect(bundle?.panel.documents[0].outstanding).toBe(50_000)
    expect(bundle?.panel.lateFeeIncomeAccountSet).toBe(false)
    expect(bundle?.paymentMethods[0].code).toBe("transfer")
  })

  it("faktur tidak ditemukan → null sesudah gerbang izin", async () => {
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue(null)
    await expect(getSalesLateFeePanelForInvoice(404)).resolves.toBeNull()
    expect(mocks.prismaMock.salesLateFee.findMany).not.toHaveBeenCalled()
  })

  it("izin ditolak → loader gagal sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak punya izin"))
    await expect(getSalesLateFeePanelForInvoice(9)).rejects.toThrow(
      "Tidak punya izin",
    )
    expect(mocks.prismaMock.salesInvoice.findFirst).not.toHaveBeenCalled()
  })
})

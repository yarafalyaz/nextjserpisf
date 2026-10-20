import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader read-model Ringkasan Tagihan Pekerjaan (F-2026-10-20-03).
 *
 * Builder pure sudah terkunci di job-billing-summary.test.ts; yang dijaga
 * di sini adalah rantai datanya: invoice dikumpulkan dari TIGA jembatan
 * (quotationId langsung, salesOrderId lewat SalesOrder, projectId lewat
 * WorkOrder.projectId) lalu di-dedup per id — satu invoice yang terjangkau
 * dua jembatan tidak boleh terhitung dua kali, kalau tidak sisa tagihan
 * mengecil diam-diam. DP BUKAN tagihan: hanya status confirmed yang masuk
 * uangMukaDiterima, dan ia tidak mengurangi sisa.
 */

const mocks = vi.hoisted(() => {
  const prismaMock = {
    quotation: { findFirst: vi.fn().mockResolvedValue(null) },
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    downPayment: { findMany: vi.fn().mockResolvedValue([]) },
    customerCredit: { findMany: vi.fn().mockResolvedValue([]) },
  }
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadJobBillingSummary } from "../job-billing-summary-data"

const QUOTATION = { id: 9, documentNo: "Q-0009", grandTotal: 100_000_000 }

function inv(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    documentNo: "INV-0001",
    status: "posted",
    grandTotal: 10_000_000,
    paidAmount: 0,
    deletedAt: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.quotation.findFirst.mockResolvedValue({ ...QUOTATION })
  mocks.prismaMock.salesOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.downPayment.findMany.mockResolvedValue([])
  mocks.prismaMock.customerCredit.findMany.mockResolvedValue([])
})

describe("loadJobBillingSummary — verifikasi (c) F-2026-10-20-03", () => {
  it("quotation tidak ada -> null, tanpa query lanjutan", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue(null)

    await expect(loadJobBillingSummary(404)).resolves.toBeNull()
    expect(mocks.prismaMock.salesInvoice.findMany).not.toHaveBeenCalled()
  })

  it("invoice sama dari jembatan langsung + salesOrder terhitung SEKALI", async () => {
    const shared = inv({ id: 7, grandTotal: 40_000_000 })
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([{ id: 3 }])
    // Jembatan 1: quotationId langsung. Jembatan 2: salesOrderId in [3].
    mocks.prismaMock.salesInvoice.findMany
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared, inv({ id: 8, grandTotal: 25_000_000 })])
      .mockResolvedValueOnce([])

    const s = await loadJobBillingSummary(9)

    expect(s?.sudahDitagih).toBe(65_000_000)
    expect(s?.sisaBelumDitagih).toBe(35_000_000)
    expect(s?.billedInvoices.map((i) => i.id)).toEqual([7, 8])
  })

  it("invoice project-linked ikut lewat WorkOrder.projectId, workOrders diteruskan", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      { id: 21, documentNo: "WO-0021", projectId: 5 },
      { id: 22, documentNo: "WO-0022", projectId: null },
    ])
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([{ id: 3 }])
    // Jembatan project hanya terpanggil bila WO ber-project; dua jembatan
  // lain kembali kosong. Urutan mock mengikuti urutan panggilan loader.
  mocks.prismaMock.salesInvoice.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([inv({ id: 9, grandTotal: 12_000_000 })])

    const s = await loadJobBillingSummary(9)

    expect(s?.sudahDitagih).toBe(12_000_000)
    expect(s?.sisaBelumDitagih).toBe(88_000_000)
    expect(s?.workOrders.map((w) => w.documentNo)).toEqual(["WO-0021", "WO-0022"])
    // Query project hanya meminta project yang benar-benar tertaut (5, bukan null).
    const calls = mocks.prismaMock.salesInvoice.findMany.mock.calls.map((c) => c[0])
    const projectCall = calls.find((c) => c?.where?.projectId)
    expect(projectCall?.where?.projectId?.in).toEqual([5])
  })

  it("tanpa salesOrder/project: query jembatan dilewati, bukan dipanggil dengan in:[]", async () => {
    await loadJobBillingSummary(9)

    // Sekali untuk jembatan langsung; dua jembatan lain short-circuit.
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledTimes(1)
    const directWhere = mocks.prismaMock.salesInvoice.findMany.mock.calls[0][0].where
    expect(directWhere).toEqual({ quotationId: 9, deletedAt: null })
  })

  it("DP hanya confirmed yang diminta; DP tidak mengurangi sisa tagihan", async () => {
    mocks.prismaMock.downPayment.findMany.mockResolvedValue([{ amount: 30_000_000 }])

    const s = await loadJobBillingSummary(9)

    const dpWhere = mocks.prismaMock.downPayment.findMany.mock.calls[0][0].where
    expect(dpWhere).toEqual({ quotationId: 9, status: "confirmed" })
    expect(s?.uangMukaDiterima).toBe(30_000_000)
    expect(s?.sisaBelumDitagih).toBe(100_000_000)
  })

  it("kredit terbuka F-43: Quotation + DownPayment quotation ini, status open saja", async () => {
    mocks.prismaMock.downPayment.findMany
      .mockResolvedValueOnce([{ amount: 0 }])
      .mockResolvedValueOnce([{ id: 11 }, { id: 12 }])
    mocks.prismaMock.customerCredit.findMany
      .mockResolvedValueOnce([
        { id: 1, documentNo: "CC-0001", receivedAmount: 28_000_000, allocatedAmount: 3_000_000, refundedAmount: 0 },
      ])
      .mockResolvedValueOnce([
        { id: 2, documentNo: "CC-0002", receivedAmount: 1_000_000, allocatedAmount: 0, refundedAmount: 0 },
        { id: 1, documentNo: "CC-0001", receivedAmount: 28_000_000, allocatedAmount: 3_000_000, refundedAmount: 0 },
      ])

    const s = await loadJobBillingSummary(9)

    const calls = mocks.prismaMock.customerCredit.findMany.mock.calls.map((c) => c[0])
    expect(calls[0].where).toEqual({ sourceType: "Quotation", sourceId: 9, status: "open" })
    expect(calls[1].where).toEqual({ sourceType: "DownPayment", sourceId: { in: [11, 12] }, status: "open" })
    // Dedup per id: CC-0001 dari dua sumber terhitung sekali.
    expect(s?.kreditTerbuka).toBe(26_000_000)
    expect(s?.openCredits.map((c) => c.id)).toEqual([1, 2])
    expect(s?.sisaBelumDitagih).toBe(100_000_000)
  })

  it("tanpa DP quotation: query kredit DownPayment dilewati", async () => {
    await loadJobBillingSummary(9)
    expect(mocks.prismaMock.customerCredit.findMany).toHaveBeenCalledTimes(1)
  })
})

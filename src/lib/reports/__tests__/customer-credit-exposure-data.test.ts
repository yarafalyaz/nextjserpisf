import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-017 F5-2/F5-4 loader bersama layar + ekspor:
 * - baris lahir dari K3-efektif>0 / K4>0 walau K1=K2=K5=0,
 * - nama/limit baris non-invoice dari satu query massal customer,
 * - ekspor memakai loader paparan yang sama (kolom K1-K5 + status).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    salesInvoice: { findMany: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    salesOrder: { findMany: vi.fn() },
    downPayment: { findMany: vi.fn() },
    customerCredit: { findMany: vi.fn() },
    workOrder: { findMany: vi.fn() },
    quotation: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
  },
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: mocks.getSystemSettings }))

import { loadCustomerCreditExposure, loadCustomerReceivables } from "../ledger-cash-data"

const period = { start: new Date("2026-01-01"), end: new Date("2026-12-31") }
const CUSTOMERS: Record<number, { id: number; name: string; creditLimit: number }> = {
  1: { id: 1, name: "PT Invoice", creditLimit: 100 },
  8: { id: 8, name: "PT DP Saja", creditLimit: 100 },
  9: { id: 9, name: "PT Kredit Saja", creditLimit: 100 },
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(mocks.prismaMock)) model.findMany.mockResolvedValue([])
  mocks.getSystemSettings.mockResolvedValue({ salesReceivableAccountId: 110 })
  mocks.prismaMock.customer.findMany.mockImplementation(async (args: { where: { id: { in: number[] } } }) =>
    args.where.id.in.map((id) => CUSTOMERS[id]).filter(Boolean),
  )
})

describe("loadCustomerCreditExposure (F5-2)", () => {
  it("pelanggan K3-efektif-saja dan K4-saja tetap tampil sebagai baris", async () => {
    mocks.prismaMock.downPayment.findMany.mockResolvedValue([{ customerId: 8, quotationId: 80, amount: 30 }])
    mocks.prismaMock.customerCredit.findMany.mockResolvedValue([
      { customerId: 9, receivedAmount: 50, allocatedAmount: 0, refundedAmount: 0 },
    ])

    const { rows } = await loadCustomerCreditExposure(period)

    const dpOnly = rows.find((r) => r.customerId === 8)
    expect(dpOnly).toMatchObject({ customerName: "PT DP Saja", outstanding: 0, confirmedDownPayment: 30, exposure: 0 })
    const creditOnly = rows.find((r) => r.customerId === 9)
    expect(creditOnly).toMatchObject({ customerName: "PT Kredit Saja", outstanding: 0, openCustomerCredit: 50, exposure: 0 })
    // Nama/limit satu query massal untuk kedua id non-invoice (tanpa N+1).
    expect(mocks.prismaMock.customer.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: expect.arrayContaining([8, 9]) } } }),
    )
  })

  it("overdue dinilai per akhir periode, bukan hari ini (laporan historis)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2027-06-01"))
    try {
      mocks.prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
        args.where.date
          ? [
              {
                id: 12,
                customerId: 1,
                grandTotal: 100,
                paidAmount: 0,
                dueDate: new Date("2027-02-01"),
                customer: { name: "PT Invoice", creditLimit: 100 },
              },
            ]
          : [],
      )

      const { rows } = await loadCustomerCreditExposure(period)

      const row = rows.find((r) => r.customerId === 1)
      expect(row).toMatchObject({ outstanding: 100, overdue: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it("baris invoice: sisa kredit dari paparan bersih, bukan K1 saja (F5-5)", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.date
        ? [{ id: 11, customerId: 1, grandTotal: 100, paidAmount: 40, dueDate: null, customer: { name: "PT Invoice", creditLimit: 100 } }]
        : [],
    )
    mocks.prismaMock.customerCredit.findMany.mockResolvedValue([
      { customerId: 1, receivedAmount: 10, allocatedAmount: 0, refundedAmount: 0 },
    ])

    const result = await loadCustomerCreditExposure(period)

    // K1=60, K4=10 -> paparan bersih 50, sisa 100-50=50 (bukan 100-60=40).
    expect(result.rows[0]).toMatchObject({ outstanding: 60, exposure: 50, remainingCredit: 50 })
    expect(result.totalExposure).toBe(50)
    expect(result.totalRemainingCredit).toBe(50)
  })
})

describe("loadCustomerReceivables ekspor (F5-4)", () => {
  it("kolom ekspor selaras layar: K1-K5, paparan, sisa kredit paparan, status", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.date
        ? [{ id: 11, customerId: 1, grandTotal: 100, paidAmount: 40, dueDate: null, customer: { name: "PT Invoice", creditLimit: 100 } }]
        : [],
    )
    mocks.prismaMock.customerCredit.findMany.mockResolvedValue([
      { customerId: 1, receivedAmount: 10, allocatedAmount: 0, refundedAmount: 0 },
    ])

    const report = await loadCustomerReceivables(period)

    const headers = report.table.columns.map((c) => c.header)
    expect(headers).toEqual([
      "Pelanggan",
      "Jml Faktur",
      "Limit Kredit",
      "Piutang",
      "Jatuh Tempo",
      "Sisa Kredit",
      "Pemakaian",
      "SO Terbuka",
      "Job Berjalan",
      "DP Terkonfirmasi",
      "Kredit Terbuka",
      "Paparan Kredit",
      "Status Kredit",
      "Rata-rata Bayar (hari)",
    ])
    const data = report.table.rows.find((r) => r.kind === "data")
    expect(data?.kind === "data" ? data.cells : []).toContain("50")
    const total = report.table.rows.find((r) => r.kind === "total")
    // Konvensi trailing: label membentang 1 kolom (Pelanggan), 13 sel sisanya.
    // Dulu 14 sel (sel kosong depan) menggeser semua total 1 kolom.
    expect(total?.kind === "total" ? total.cells : []).toHaveLength(13)
    expect(total?.kind === "total" ? total.cells[4] : null).toBe("50")
  })

  it("sisa kredit dan paparan sen tidak dibulatkan menjadi nol", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.date
        ? [{ id: 11, customerId: 1, grandTotal: 100.01, paidAmount: 0, dueDate: null, customer: { name: "PT Sen", creditLimit: 100 } }]
        : [],
    )

    const report = await loadCustomerReceivables(period)

    const data = report.table.rows.find((r) => r.kind === "data")
    const cells = data?.kind === "data" ? data.cells : []
    // Paparan 100,01 melewati limit 100 → sisa kredit −0,01, status "Lewat batas".
    expect(cells).toContain("100,01")
    expect(cells).toContain("(0,01)")
    expect(cells).toContain("Lewat batas")
    expect(cells).not.toContain("(0)")
  })
})

describe("FIN-BR-008 paparan kredit (loader)", () => {
  it("query pembayaran memakai status bukan-reversed", async () => {
    const { loadCustomerCreditExposure } = await import("../ledger-cash-data")
    await loadCustomerCreditExposure({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    expect(mocks.prismaMock.salesPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "reversed" } }),
      }),
    )
  })

  it("putaran 55: SO draft tidak menekan K5 (whitelist OPEN_ORDER_STATUSES)", async () => {
    // WO aktif -> quotation 50 (Rp100jt) + SO draft se-quotation -> K5
    // harus tetap 100jt: penekan K5 hanya SO terbuka
    // (confirmed/processing/completed, OPEN_ORDER_STATUSES kanonis).
    // SO draft bukan komitmen — menekan K5 = bypass gerbang kredit
    // paper-only (draft tidak melewati gate apa pun).
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      { customerId: 1, quotationId: 50 },
    ])
    mocks.prismaMock.quotation.findMany.mockImplementation(async (args: any) =>
      args?.where?.id?.in?.includes(50)
        ? [{ id: 50, customerId: 1, grandTotal: 100, customer: { name: "PT Fleet", creditLimit: 500 } }]
        : [],
    )

    const { rows } = await loadCustomerCreditExposure(period)

    const fleet = rows.find((r) => r.customerId === 1)
    expect(fleet?.woUnrepresented).toBe(100)
    // SO penekan K5 hanya berupa whitelist terbuka, bukan not-cancelled.
    for (const call of mocks.prismaMock.salesOrder.findMany.mock.calls as any[]) {
      if (call[0]?.where?.quotationId) {
        expect(call[0].where.status).toEqual(
          expect.objectContaining({ in: expect.arrayContaining(["confirmed"]) }),
        )
      }
    }
  })
})

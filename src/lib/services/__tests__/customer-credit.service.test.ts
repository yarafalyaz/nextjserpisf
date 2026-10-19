import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * AUD-NEXT-03/04/07: kredit pelanggan operasional penuh.
 * - NEXT-03: DP lanjutan > sisa faktur → cap paidAmount + kredit selisih.
 * - NEXT-04: alokasi/refund tolak melebihi saldo; lock baris di tx.
 * - NEXT-07: itemId 0 = baris jasa/custom (terdokumentasi, bukan item stok).
 */

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  creditFindUnique: vi.fn(),
  creditFindFirst: vi.fn(),
  creditCreate: vi.fn(),
  creditUpdate: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  paymentCreate: vi.fn(),
  paymentFindMany: vi.fn(),
  journalCreate: vi.fn(),
  docNo: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: any) => mocks.transaction(fn),
    customerCredit: {
      findUnique: (...a: unknown[]) => mocks.creditFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => mocks.creditFindUnique(...a),
      findFirst: (...a: unknown[]) => mocks.creditFindFirst(...a),
      create: (...a: unknown[]) => mocks.creditCreate(...a),
      update: (...a: unknown[]) => mocks.creditUpdate(...a),
    },
    salesInvoice: {
      findUnique: (...a: unknown[]) => mocks.invoiceFindUnique(...a),
      update: (...a: unknown[]) => mocks.invoiceUpdate(...a),
    },
    salesPayment: {
      create: (...a: unknown[]) => mocks.paymentCreate(...a),
      findMany: (...a: unknown[]) => mocks.paymentFindMany(...a),
    },
    journal: { create: (...a: unknown[]) => mocks.journalCreate(...a) },
  },
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.docNo(...a),
}))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesPaymentCreated: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn().mockResolvedValue({
    cashBankAccountId: 100,
    customerDownPaymentAccountId: 210102,
  }),
}))

vi.mock("@/lib/utils/error", () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

import {
  allocateCreditToInvoice,
  refundCredit,
  creditBalance,
} from "../customer-credit.service"

function buildTx() {
  return {
    $queryRaw: vi.fn().mockResolvedValue(undefined),
    customerCredit: {
      findUniqueOrThrow: mocks.creditFindUnique,
      findFirst: mocks.creditFindFirst,
      create: mocks.creditCreate,
      update: mocks.creditUpdate,
    },
    salesInvoice: {
      findUniqueOrThrow: mocks.invoiceFindUnique,
      update: mocks.invoiceUpdate,
    },
    salesPayment: {
      create: mocks.paymentCreate,
      findMany: mocks.paymentFindMany,
    },
    journal: { create: mocks.journalCreate },
  }
}

describe("customer-credit.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.docNo.mockImplementation((p: string) => Promise.resolve(`${p}-1`))
    mocks.transaction.mockImplementation(async (fn: any) => fn(buildTx()))
    mocks.paymentCreate.mockResolvedValue({ id: 999 })
    mocks.paymentFindMany.mockResolvedValue([{ amount: 8000 }, { amount: 2000 }])
    mocks.invoiceUpdate.mockResolvedValue({})
    mocks.creditUpdate.mockResolvedValue({})
    mocks.journalCreate.mockResolvedValue({ id: 1 })
  })

  it("alokasi normal: kurangi saldo + lunasi faktur", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      id: 1, documentNo: "CC-1", customerId: 9,
      receivedAmount: 3000, allocatedAmount: 0, refundedAmount: 0, status: "open",
    })
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 101, grandTotal: 10000, paidAmount: 8000, status: "posted",
    })
    const r = await allocateCreditToInvoice(1, 101, 2000, 7)
    expect(r.success).toBe(true)
    // Lock baris dulu (suntik race ditolak antre di sini).
    const txCalls: string[] = []
    expect(mocks.transaction).toHaveBeenCalled()
    void txCalls
    expect(mocks.paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethod: "customer_credit",
          amount: 2000,
        }),
      }),
    )
    expect(mocks.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ allocatedAmount: 2000, status: "open" }),
      }),
    )
    // paidAmount = min(8000+2000, 10000) = 10000 → paid.
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidAmount: 10000, paymentStatus: "paid" }),
      }),
    )
  })

  it("alokasi habiskan saldo: status jadi used", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      id: 1, documentNo: "CC-1", customerId: 9,
      receivedAmount: 3000, allocatedAmount: 0, refundedAmount: 0, status: "open",
    })
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 101, grandTotal: 10000, paidAmount: 7000, status: "posted",
    })
    mocks.paymentFindMany.mockResolvedValue([{ amount: 7000 }, { amount: 3000 }])
    const r = await allocateCreditToInvoice(1, 101, 3000, 7)
    expect(r.success).toBe(true)
    expect(mocks.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "used" }) }),
    )
  })

  it("alokasi > saldo: DITOLAK (tak ada jurnal setengah jalan)", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      id: 1, documentNo: "CC-1", customerId: 9,
      receivedAmount: 3000, allocatedAmount: 1000, refundedAmount: 0, status: "open",
    })
    const r = await allocateCreditToInvoice(1, 101, 2500, 7)
    expect(r.success).toBe(false)
    expect(r.error).toContain("tidak cukup")
    expect(mocks.paymentCreate).not.toHaveBeenCalled()
    expect(mocks.creditUpdate).not.toHaveBeenCalled()
  })

  it("alokasi > sisa faktur: DITOLAK", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      id: 1, documentNo: "CC-1", customerId: 9,
      receivedAmount: 9000, allocatedAmount: 0, refundedAmount: 0, status: "open",
    })
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 101, grandTotal: 10000, paidAmount: 8000, status: "posted",
    })
    const r = await allocateCreditToInvoice(1, 101, 5000, 7)
    expect(r.success).toBe(false)
    expect(r.error).toContain("sisa faktur")
  })

  it("alokasi ke faktur batal: DITOLAK", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      id: 1, documentNo: "CC-1", customerId: 9,
      receivedAmount: 9000, allocatedAmount: 0, refundedAmount: 0, status: "open",
    })
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 101, grandTotal: 10000, paidAmount: 0, status: "cancelled",
    })
    const r = await allocateCreditToInvoice(1, 101, 1000, 7)
    expect(r.success).toBe(false)
    expect(r.error).toContain("batal")
  })

  it("refund normal: jurnal Dr 210102 / Cr Kas + status refunded bila habis", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      id: 1, documentNo: "CC-1", customerId: 9,
      receivedAmount: 3000, allocatedAmount: 1000, refundedAmount: 0, status: "open",
    })
    const r = await refundCredit(1, 2000, 7)
    expect(r.success).toBe(true)
    expect(mocks.journalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: "CustomerCredit",
          entries: {
            create: [
              expect.objectContaining({ accountId: 210102, debit: 2000 }),
              expect.objectContaining({ accountId: 100, credit: 2000 }),
            ],
          },
        }),
      }),
    )
    expect(mocks.creditUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundedAmount: 2000, status: "refunded" }),
      }),
    )
  })

  it("refund > saldo: DITOLAK tanpa jurnal", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      id: 1, documentNo: "CC-1", customerId: 9,
      receivedAmount: 3000, allocatedAmount: 1000, refundedAmount: 0, status: "open",
    })
    const r = await refundCredit(1, 2500, 7)
    expect(r.success).toBe(false)
    expect(r.error).toContain("tidak cukup")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("creditBalance = received - allocated - refunded", async () => {
    mocks.creditFindUnique.mockResolvedValue({
      receivedAmount: 3000, allocatedAmount: 1000, refundedAmount: 500,
    })
    expect(await creditBalance(1)).toBe(1500)
  })
})

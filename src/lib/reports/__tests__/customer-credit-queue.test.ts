import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  CUSTOMER_CREDIT_FP_UM_MARKER_LABEL,
  CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL,
  buildCustomerCreditQueue,
  customerCreditBalance,
  type CustomerCreditQueueCreditInput,
  type CustomerCreditQueueDownPaymentInput,
} from "../customer-credit-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findCredits: vi.fn(),
  findDownPayments: vi.fn(),
  findTaxInvoices: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customerCredit: { findMany: (...a: unknown[]) => mocks.findCredits(...a) },
    downPayment: { findMany: (...a: unknown[]) => mocks.findDownPayments(...a) },
    taxInvoice: { findMany: (...a: unknown[]) => mocks.findTaxInvoices(...a) },
  },
}))

import { getCustomerCreditQueue } from "../customer-credit-queue-data"

// Hari kalender WIB tetap: NOW = 2026-10-27 WIB.
const NOW = new Date("2026-10-26T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function credit(
  partial: Partial<CustomerCreditQueueCreditInput> & { creditId: number },
): CustomerCreditQueueCreditInput {
  return {
    documentNo: `CC-${partial.creditId}`,
    customerId: 7,
    customerName: "CV Uji",
    sourceType: "DownPayment",
    sourceId: 100,
    receivedAmount: 10_000_000,
    allocatedAmount: 0,
    refundedAmount: 0,
    status: "open",
    createdAt: day(-10),
    ...partial,
  }
}

const dp = (
  partial: Partial<CustomerCreditQueueDownPaymentInput> & {
    downPaymentId: number
  },
): CustomerCreditQueueDownPaymentInput => ({
  ppnUangMuka: 1_000_000,
  ...partial,
})

describe("buildCustomerCreditQueue builder (083-S/085-V)", () => {
  it("saldo kanonik = received - allocated - refunded (service:30-33)", () => {
    expect(
      customerCreditBalance({
        receivedAmount: 100,
        allocatedAmount: 30,
        refundedAmount: 20,
      }),
    ).toBe(50)
  })

  it("V1: DP ber-FP UM aktif + ppnUangMuka > 0 berpenanda verbatim; alokasi tidak terhalang", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1 })],
      [dp({ downPaymentId: 100 })],
      new Set([100]),
      { now: NOW },
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].penandaFpUangMuka).toBe(true)
    expect(queue.rows[0].penandaFpUangMukaLabel).toBe(
      CUSTOMER_CREDIT_FP_UM_MARKER_LABEL,
    )
    expect(CUSTOMER_CREDIT_FP_UM_MARKER_LABEL).toBe(
      "Refund menunggu pembatalan FP uang muka",
    )
    // J-RF1 hanya menahan refund — alokasi TIDAK terhalang penanda.
    expect(queue.rows[0].alokasiTerhalang).toBe(false)
    expect(queue.summary.jumlahPenandaFpUangMuka).toBe(1)
  })

  it("V1: sesudah FP UM dibatalkan (himpunan aktif kosong) penanda hilang", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1 })],
      [dp({ downPaymentId: 100 })],
      new Set(),
      { now: NOW },
    )
    expect(queue.rows[0].penandaFpUangMuka).toBe(false)
    expect(queue.rows[0].penandaFpUangMukaLabel).toBeNull()
    expect(queue.summary.jumlahPenandaFpUangMuka).toBe(0)
  })

  it("tanpa penanda: ppnUangMuka 0 / snapshot null / sumber bukan DownPayment", () => {
    const queue = buildCustomerCreditQueue(
      [
        credit({ creditId: 1, sourceId: 100 }),
        credit({ creditId: 2, sourceId: 101 }),
        credit({ creditId: 3, sourceType: "RevisionDown", sourceId: 100 }),
        credit({ creditId: 4, sourceType: "Quotation", sourceId: 100 }),
      ],
      [dp({ downPaymentId: 100, ppnUangMuka: 0 }), dp({ downPaymentId: 101, ppnUangMuka: null })],
      new Set([100, 101]),
      { now: NOW },
    )
    expect(queue.rows).toHaveLength(4)
    for (const row of queue.rows) {
      expect(row.penandaFpUangMuka).toBe(false)
      expect(row.penandaFpUangMukaLabel).toBeNull()
    }
    // RevisionDown verbatim tanpa label terjurnal karangan (Putusan 3).
    expect(queue.rows.find((r) => r.creditId === 3)?.sourceType).toBe(
      "RevisionDown",
    )
  })

  it("BR-CCQ-01/EC-CCQ-2: populasi open saldo>0 saja; anomali terhitung terpisah, tidak masuk total", () => {
    const queue = buildCustomerCreditQueue(
      [
        credit({ creditId: 1, receivedAmount: 100 }),
        credit({ creditId: 2, status: "used", receivedAmount: 100, allocatedAmount: 40 }),
        credit({ creditId: 3, status: "refunded", receivedAmount: 100, refundedAmount: 40 }),
        credit({ creditId: 4, receivedAmount: 100, allocatedAmount: 100 }),
        credit({ creditId: 5, receivedAmount: 100, allocatedAmount: 80, refundedAmount: 40 }),
      ],
      [],
      new Set(),
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.creditId)).toEqual([1])
    expect(queue.summary).toEqual({
      jumlahBaris: 1,
      totalSaldo: 100,
      jumlahPenandaFpUangMuka: 0,
    })
    expect(queue.anomaly.openSaldoNol).toBe(2)
    expect(queue.anomaly.selesaiSaldoPositif).toBe(2)
    expect(queue.anomaly.alokasiMelebihiDiterima).toBe(1)
  })

  it("umur dari createdAt hari kalender WIB (bukan updatedAt), clamp 0; rekap = baris tampil persis", () => {
    const queue = buildCustomerCreditQueue(
      [
        credit({ creditId: 2, createdAt: day(-3), receivedAmount: 50 }),
        credit({ creditId: 1, createdAt: day(-10), receivedAmount: 70 }),
        credit({ creditId: 3, createdAt: day(2), receivedAmount: 10 }),
      ],
      [],
      new Set(),
      { now: NOW },
    )
    // Tertua dulu (usul BR-CCQ-07).
    expect(queue.rows.map((r) => r.creditId)).toEqual([1, 2, 3])
    expect(queue.rows.map((r) => r.umurMenungguHari)).toEqual([10, 3, 0])
    expect(queue.summary.totalSaldo).toBe(130)
    expect(CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL).toBe(
      "Total saldo kredit terbuka pada baris tampil",
    )
    // Larangan 085-V Putusan 1: label rekap tanpa kata utang/aging/buku.
    expect(CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL.toLowerCase()).not.toContain("utang")
    expect(CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL.toLowerCase()).not.toContain("aging")
  })

  it("payload baris tanpa field pembayaran sensitif (BR-CCQ-05)", () => {
    const queue = buildCustomerCreditQueue(
      [credit({ creditId: 1 })],
      [dp({ downPaymentId: 100 })],
      new Set([100]),
      { now: NOW },
    )
    const keys = Object.keys(queue.rows[0])
    for (const banned of ["proofImage", "paymentMethod", "phone", "bank", "referenceNo"]) {
      expect(keys).not.toContain(banned)
    }
  })
})

describe("customer-credit-queue loader (anti-N+1 + gerbang)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "7" })
    mocks.findCredits.mockResolvedValue([
      {
        id: 1, documentNo: "CC-1", customerId: 7, sourceType: "DownPayment",
        sourceId: 100, receivedAmount: 10000000, allocatedAmount: 0,
        refundedAmount: 0, status: "open", createdAt: day(-10),
        customer: { name: "CV Uji" },
      },
      {
        id: 2, documentNo: "CC-2", customerId: 8, sourceType: "DownPayment",
        sourceId: 101, receivedAmount: 5000000, allocatedAmount: 0,
        refundedAmount: 0, status: "open", createdAt: day(-5),
        customer: { name: "PT Lain" },
      },
      {
        id: 3, documentNo: "CC-3", customerId: 9, sourceType: "RevisionDown",
        sourceId: 55, receivedAmount: 2000000, allocatedAmount: 0,
        refundedAmount: 0, status: "open", createdAt: day(-1),
        customer: { name: "PT Revisi" },
      },
    ])
    mocks.findDownPayments.mockResolvedValue([
      { id: 100, vatAmount: 1000000 },
      { id: 101, vatAmount: 0 },
    ])
    // Hanya DP 100 ber-FP keluaran aktif; DP 101 tanpa FP aktif.
    mocks.findTaxInvoices.mockResolvedValue([{ downPaymentId: 100 }])
  })

  it("V1/V6: satu query TaxInvoice massal atas himpunan DP; hanya DP ber-FP aktif + ppn>0 berpenanda", async () => {
    const queue = await getCustomerCreditQueue({ now: NOW })
    expect(queue.rows).toHaveLength(3)
    const byId = new Map(queue.rows.map((r) => [r.creditId, r]))
    expect(byId.get(1)?.penandaFpUangMuka).toBe(true)
    expect(byId.get(1)?.penandaFpUangMukaLabel).toBe(
      "Refund menunggu pembatalan FP uang muka",
    )
    expect(byId.get(2)?.penandaFpUangMuka).toBe(false)
    expect(byId.get(3)?.penandaFpUangMuka).toBe(false)

    // Anti-N+1: tepat satu panggilan per model, himpunan DP populasi.
    expect(mocks.findCredits).toHaveBeenCalledTimes(1)
    expect(mocks.findDownPayments).toHaveBeenCalledTimes(1)
    expect(mocks.findTaxInvoices).toHaveBeenCalledTimes(1)
    expect(mocks.findDownPayments.mock.calls[0]?.[0]?.where).toEqual({
      id: { in: [100, 101] },
    })
    expect(mocks.findTaxInvoices.mock.calls[0]?.[0]?.where).toEqual({
      downPaymentId: { in: [100, 101] },
      direction: "out",
      djpStatus: { notIn: ["cancelled", "replaced"] },
    })
    // Select ramping: tanpa bukti/kontak/rekening (BR-CCQ-05).
    const creditSelect = JSON.stringify(
      mocks.findCredits.mock.calls[0]?.[0]?.select ?? {},
    )
    expect(creditSelect).not.toContain("phone")
    expect(creditSelect).not.toContain("proofImage")
  })

  it("gerbang ganda fail-closed sebelum query apa pun (usul Q-CCQ-3 paling ketat)", async () => {
    await getCustomerCreditQueue({ now: NOW })
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_sales_invoices")
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "confirm_down_payments",
    )

    vi.clearAllMocks()
    mocks.requirePermission.mockRejectedValue(new Error("ditolak"))
    await expect(getCustomerCreditQueue({ now: NOW })).rejects.toThrow(
      "ditolak",
    )
    expect(mocks.findCredits).not.toHaveBeenCalled()
    expect(mocks.findDownPayments).not.toHaveBeenCalled()
    expect(mocks.findTaxInvoices).not.toHaveBeenCalled()
  })

  it("populasi tanpa sumber DownPayment: query DP/FP dilewati, penanda kosong", async () => {
    mocks.findCredits.mockResolvedValue([
      {
        id: 3, documentNo: "CC-3", customerId: 9, sourceType: "RevisionDown",
        sourceId: 55, receivedAmount: 2000000, allocatedAmount: 0,
        refundedAmount: 0, status: "open", createdAt: day(-1),
        customer: { name: "PT Revisi" },
      },
    ])
    const queue = await getCustomerCreditQueue({ now: NOW })
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].penandaFpUangMuka).toBe(false)
    expect(mocks.findDownPayments).not.toHaveBeenCalled()
    expect(mocks.findTaxInvoices).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  INVOICE_EXCHANGE_OVERDUE_ANOMALY_LABEL,
  INVOICE_EXCHANGE_OVERDUE_ANOMALY_ONLY_LABEL,
  INVOICE_EXCHANGE_OVERDUE_COLUMN_LABELS,
  INVOICE_EXCHANGE_OVERDUE_DIFFERENCE_LABEL,
  INVOICE_EXCHANGE_OVERDUE_NOTICE_TEXT,
  INVOICE_EXCHANGE_OVERDUE_NO_DUE_DATE_LABEL,
  INVOICE_EXCHANGE_OVERDUE_TITLE,
  buildInvoiceExchangeOverdueQueue,
  type InvoiceExchangeOverdueInput,
  type InvoiceExchangeOverdueInvoiceInput,
} from "../invoice-exchange-overdue-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  exchangeFindMany: vi.fn(),
  requirePermission: vi.fn(),
  loadReturnCreditByInvoiceId: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    invoiceExchange: { findMany: (...a: unknown[]) => mocks.exchangeFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

vi.mock("@/lib/reports/return-credit", () => ({
  loadReturnCreditByInvoiceId: (...a: unknown[]) => mocks.loadReturnCreditByInvoiceId(...a),
}))

import { getInvoiceExchangeOverdueQueue } from "../invoice-exchange-overdue-queue-data"

// 2026-10-26 WIB (instan 05:00 WIB).
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function invoice(overrides: Partial<InvoiceExchangeOverdueInvoiceInput> = {}): InvoiceExchangeOverdueInvoiceInput {
  return {
    salesInvoiceId: 11,
    exchangedAmount: 1_000_000,
    grandTotal: 1_000_000,
    paidAmount: 0,
    status: "posted",
    deletedAt: null,
    returnCredit: 0,
    ...overrides,
  }
}

function input(overrides: Partial<InvoiceExchangeOverdueInput> = {}): InvoiceExchangeOverdueInput {
  return {
    exchangeId: 1,
    slug: "tukar-1",
    documentNo: "TF/2026/001",
    date: day(-10),
    customerName: "Pelanggan Uji",
    receiptNumber: "TT-1",
    dueDate: day(-1),
    deletedAt: null,
    invoices: [invoice()],
    ...overrides,
  }
}

describe("invoice-exchange-overdue-queue (F-2026-10-27-101-S + 110-V)", () => {
  it("kata verbatim putusan Q-IEX-2 + vonis 110-V", () => {
    expect(INVOICE_EXCHANGE_OVERDUE_TITLE).toBe("Tukar Faktur Lewat Batas")
    expect(INVOICE_EXCHANGE_OVERDUE_COLUMN_LABELS).toEqual({
      document: "Dokumen",
      exchangeDate: "Tanggal Serah",
      customer: "Pelanggan",
      receiptNumber: "Tanda Terima",
      dueDate: "Batas Kembali",
      invoiceCount: "Faktur",
      exchangeValue: "Nilai Serah",
      paid: "Dibayar",
      remaining: "Sisa",
    })
    expect(INVOICE_EXCHANGE_OVERDUE_NO_DUE_DATE_LABEL).toBe("Tanpa batas kembali")
    expect(INVOICE_EXCHANGE_OVERDUE_ANOMALY_LABEL).toBe("Faktur tertaut tidak berlaku")
    expect(INVOICE_EXCHANGE_OVERDUE_ANOMALY_ONLY_LABEL).toBe("Semua faktur tertaut tidak berlaku")
    expect(INVOICE_EXCHANGE_OVERDUE_DIFFERENCE_LABEL).toBe("Selisih dengan nilai faktur saat ini")
    expect(INVOICE_EXCHANGE_OVERDUE_NOTICE_TEXT).toContain("bukan saldo piutang")
    expect(INVOICE_EXCHANGE_OVERDUE_NOTICE_TEXT).not.toMatch(/denda|tunggakan/i)
  })

  it("AC-IEX-B1: dueDate kemarin + sisa tampil; hari ini/besok tidak; tanpa dueDate penanda", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [
        input({ exchangeId: 1, documentNo: "TF/A", dueDate: day(-1) }),
        input({ exchangeId: 2, documentNo: "TF/B", dueDate: day(0) }),
        input({ exchangeId: 3, documentNo: "TF/C", dueDate: day(1) }),
        input({ exchangeId: 4, documentNo: "TF/D", dueDate: null }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.exchangeId)).toEqual([1])
    expect(queue.rows[0].overdueDays).toBe(1)
    expect(queue.withoutDueDateCount).toBe(1)
    expect(queue.withoutDueDateLabel).toBe("Tanpa batas kembali")
  })

  it("AC-IEX-B2: 3 faktur = 1 baris; sisa = snapshot - paidAmount; cabut paidAmount mengubah sisa", () => {
    const invoices = [
      invoice({ salesInvoiceId: 11, exchangedAmount: 1_000_000, grandTotal: 1_000_000, paidAmount: 400_000 }),
      invoice({ salesInvoiceId: 12, exchangedAmount: 2_000_000, grandTotal: 2_000_000, paidAmount: 500_000 }),
      invoice({ salesInvoiceId: 13, exchangedAmount: 3_000_000, grandTotal: 3_000_000, paidAmount: 0 }),
    ]
    const queue = buildInvoiceExchangeOverdueQueue([input({ invoices })], NOW)
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].invoiceCount).toBe(3)
    expect(queue.rows[0].exchangedAmount).toBe(6_000_000)
    expect(queue.rows[0].paidAmount).toBe(900_000)
    expect(queue.rows[0].remainingAmount).toBe(5_100_000)
    expect(queue.rows[0].settlementStatus).toBe("partial")
  })

  it("AC-IEX-B3: semua lunas keluar walau dueDate lampau; dokumen terhapus tidak tampil", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [
        input({ exchangeId: 1, invoices: [invoice({ paidAmount: 1_000_000 })] }),
        input({ exchangeId: 2, deletedAt: day(-2) }),
      ],
      NOW,
    )
    expect(queue.rows).toEqual([])
    expect(queue.totalDocuments).toBe(0)
  })

  it("110-V: faktur cancelled = anomali keluar total, tidak menyumbang Lunas", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [
        input({
          invoices: [
            invoice({ salesInvoiceId: 11, exchangedAmount: 1_000_000, paidAmount: 0 }),
            invoice({ salesInvoiceId: 12, exchangedAmount: 5_000_000, grandTotal: 5_000_000, paidAmount: 0, status: "cancelled" }),
          ],
        }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].exchangedAmount).toBe(1_000_000)
    expect(queue.rows[0].remainingAmount).toBe(1_000_000)
    expect(queue.rows[0].anomalyCount).toBe(1)
    expect(queue.rows[0].anomalyLabel).toBe("Faktur tertaut tidak berlaku")
    expect(queue.rows[0].settlementStatus).toBe("outstanding")
    expect(queue.totals.remainingAmount).toBe(1_000_000)
    expect(queue.totals.anomalyCount).toBe(1)
  })

  it("110-V: selisih snapshot vs faktur hidup tertanda, bukan dipilih diam-diam", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [input({ invoices: [invoice({ exchangedAmount: 1_000_000, grandTotal: 800_000, paidAmount: 0 })] })],
      NOW,
    )
    expect(queue.rows[0].remainingAmount).toBe(1_000_000)
    expect(queue.rows[0].liveRemainingAmount).toBe(800_000)
    expect(queue.rows[0].differenceAmount).toBe(200_000)
    expect(queue.rows[0].hasDifference).toBe(true)
    expect(queue.rows[0].differenceLabel).toBe("Selisih dengan nilai faktur saat ini")
  })

  it("110-V: faktur tertutup retur-kredit penuh = anomali", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [
        input({
          invoices: [
            invoice({ salesInvoiceId: 11, exchangedAmount: 1_000_000, paidAmount: 0 }),
            invoice({ salesInvoiceId: 12, exchangedAmount: 2_000_000, grandTotal: 2_000_000, paidAmount: 0, returnCredit: 2_000_000 }),
          ],
        }),
      ],
      NOW,
    )
    expect(queue.rows[0].anomalyCount).toBe(1)
    expect(queue.rows[0].remainingAmount).toBe(1_000_000)
  })

  it("verdict #1191 minor-1: dokumen semua-anomali (cancelled) tertanda anomalyOnlyCount, bukan baris/totals", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [
        input({ exchangeId: 1, documentNo: "TF/A", invoices: [invoice({ status: "cancelled" })] }),
        input({
          exchangeId: 2,
          documentNo: "TF/B",
          invoices: [
            invoice({ salesInvoiceId: 11, exchangedAmount: 1_000_000 }),
            invoice({ salesInvoiceId: 12, exchangedAmount: 5_000_000, grandTotal: 5_000_000, status: "cancelled" }),
          ],
        }),
        // semua-anomali tapi dueDate BELUM lampau -> bukan anomalyOnly
        input({ exchangeId: 3, documentNo: "TF/C", dueDate: day(2), invoices: [invoice({ status: "cancelled" })] }),
        // lunas penuh dueDate lampau -> hilang sah, bukan anomalyOnly
        input({ exchangeId: 4, documentNo: "TF/D", invoices: [invoice({ paidAmount: 1_000_000 })] }),
        // tanpa faktur sama sekali -> bukan anomalyOnly
        input({ exchangeId: 5, documentNo: "TF/E", invoices: [] }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.exchangeId)).toEqual([2])
    expect(queue.anomalyOnlyCount).toBe(1)
    expect(queue.anomalyOnlyLabel).toBe("Semua faktur tertaut tidak berlaku")
    expect(queue.totalDocuments).toBe(1)
    expect(queue.totals.anomalyCount).toBe(1)
    expect(queue.totals.remainingAmount).toBe(1_000_000)
  })

  it("verdict #1191 minor-1: semua-anomali via terhapus & retur-penuh juga tertanda", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [
        input({ exchangeId: 1, invoices: [invoice({ deletedAt: day(-1) })] }),
        input({ exchangeId: 2, invoices: [invoice({ grandTotal: 2_000_000, exchangedAmount: 2_000_000, returnCredit: 2_000_000 })] }),
      ],
      NOW,
    )
    expect(queue.rows).toEqual([])
    expect(queue.anomalyOnlyCount).toBe(2)
  })

  it("verdict #1191 minor-2 (kosmetik): withoutDueDateCount abaikan dokumen lunas penuh & semua-anomali", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [
        input({ exchangeId: 1, dueDate: null, invoices: [invoice()] }), // sisa >0 -> dihitung
        input({ exchangeId: 2, dueDate: null, invoices: [invoice({ paidAmount: 1_000_000 })] }), // lunas -> tidak
        input({ exchangeId: 3, dueDate: null, invoices: [invoice({ status: "cancelled" })] }), // semua anomali -> tidak
      ],
      NOW,
    )
    expect(queue.rows).toEqual([])
    expect(queue.withoutDueDateCount).toBe(1)
    expect(queue.anomalyOnlyCount).toBe(0)
  })

  it("AC-IEX-B5: urutan dueDate lampau dulu, seri documentNo; rekap hanya baris tampil", () => {
    const queue = buildInvoiceExchangeOverdueQueue(
      [
        input({ exchangeId: 1, documentNo: "TF/B", dueDate: day(-2) }),
        input({ exchangeId: 2, documentNo: "TF/A", dueDate: day(-5) }),
        input({ exchangeId: 3, documentNo: "TF/C", dueDate: day(-2) }),
        input({ exchangeId: 4, documentNo: "TF/D", dueDate: day(3) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.documentNo)).toEqual(["TF/A", "TF/B", "TF/C"])
    expect(queue.totals.remainingAmount).toBe(3_000_000)
  })

  it("EC-4: receiptNumber kosong tetap null (UI tampil —), bukan karangan", () => {
    const queue = buildInvoiceExchangeOverdueQueue([input({ receiptNumber: null })], NOW)
    expect(queue.rows[0].receiptNumber).toBeNull()
  })
})

describe("getInvoiceExchangeOverdueQueue (loader fail-closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.exchangeFindMany.mockResolvedValue([])
    mocks.loadReturnCreditByInvoiceId.mockResolvedValue(new Map())
  })

  it("AC-IEX-B4: tanpa izin menolak sebelum query", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getInvoiceExchangeOverdueQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_invoice_exchanges")
    expect(mocks.exchangeFindMany).not.toHaveBeenCalled()
  })

  it("satu query massal + returnCredit diteruskan ke builder", async () => {
    mocks.exchangeFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "tukar-1",
        documentNo: "TF/2026/001",
        date: day(-10),
        receiptNumber: null,
        dueDate: day(-1),
        deletedAt: null,
        customer: { name: "Pelanggan Uji" },
        items: [
          {
            amount: 1000000,
            salesInvoice: { id: 11, grandTotal: 1000000, paidAmount: 250000, status: "partial", deletedAt: null },
          },
        ],
      },
    ])
    const queue = await getInvoiceExchangeOverdueQueue({ now: NOW })
    expect(mocks.exchangeFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.loadReturnCreditByInvoiceId).toHaveBeenCalledWith([11])
    expect(queue.rows[0].remainingAmount).toBe(750_000)
    const arg = mocks.exchangeFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ deletedAt: null })
  })
})

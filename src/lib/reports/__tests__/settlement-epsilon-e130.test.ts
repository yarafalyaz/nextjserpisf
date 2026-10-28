import { describe, it, expect, vi } from "vitest"

// buildAgingRows tinggal serumah dengan Letterhead (next-auth) — mock
// permukaan beratnya seperti tes aging-report-view existing.
vi.mock("@/components/reports/report-letterhead", () => ({ ReportLetterhead: () => null }))
import {
  COLLECTION_SETTLED_EPSILON,
} from "@/lib/reports/aging-amounts"
import { SETTLEMENT_TOLERANCE_IDR } from "@/lib/finance/settlement-status"
import { buildCollectionQueue } from "@/lib/reports/collection-queue"
import { buildCustomerStatement } from "@/lib/reports/customer-statement"
import { buildDeliveredUnbilledQueue } from "@/lib/reports/delivered-unbilled"
import { buildInvoiceExchangeOverdueQueue } from "@/lib/reports/invoice-exchange-overdue-queue"
import { settlementStatus } from "@/lib/finance/invoice-exchange"
import { buildAgingTotals } from "@/lib/reports/aging-amounts"
import { buildAgingRows } from "@/components/reports/aging-report-view"
import { FULFILLABLE_ORDER_STATUSES } from "@/lib/reports/order-fulfillment-data"

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const NOW = new Date("2026-10-26T14:00:00.000Z")
const DUE_PAST = D("2026-10-20")
const DUE_FUTURE = D("2026-11-10")

/**
 * Falsifikasi QA E130 atas head persis (vonis F-2026-10-28-130-V + putusan
 * Lead Q-EPS-1..5): satu ambang lunas Rp1 di seluruh permukaan piutang.
 * Tiap butir MERAH bila penjaga dicabut, hijau bila fisik terpasang.
 */
describe("E130 paritas lunas Rp1 lintas permukaan (FIN-BR-006)", () => {
  it("E130-AC1: alias warisan Rp1; tulis ulang 0.005 = MERAH", () => {
    expect(SETTLEMENT_TOLERANCE_IDR).toBe(1)
    expect(COLLECTION_SETTLED_EPSILON).toBe(SETTLEMENT_TOLERANCE_IDR)
    expect(COLLECTION_SETTLED_EPSILON).toBe(1)
  })

  it("E130-1: sisa 0,50 -> paid di layar tukar faktur, tidak di antrean, tidak overdue", () => {
    expect(settlementStatus(1_000_000, 999_999.5)).toBe("settled")
    const queue = buildCollectionQueue(
      [{
        invoiceId: 1, documentNo: "INV-1", status: "posted", deletedAt: null,
        date: DUE_PAST, dueDate: DUE_FUTURE, grandTotal: 1_000_000,
        paidAmount: 999_999.5, customerId: 1, customerName: "A",
        customerPhone: null, contactPerson: null,
      }],
      [], [],
      { now: NOW },
    )
    expect(queue.rows).toEqual([])
    const statement = buildCustomerStatement({
      customerId: 1, periodStart: D("2026-10-01"), periodEnd: D("2026-10-31"),
      invoices: [{ id: 1, documentNo: "INV-1", date: DUE_PAST, grandTotal: 1_000_000 }],
      payments: [{
        id: 11, documentNo: "PAY-11", salesInvoiceId: 1,
        salesInvoiceDocumentNo: "INV-1", paymentDate: D("2026-10-21"),
        amount: 999_999.5, withholdingAmount: 0, paymentMethod: "transfer",
      }],
    })
    expect(statement.entries.find((e) => e.kind === "invoice")?.isOverdue).toBe(false)
    const overdue = buildInvoiceExchangeOverdueQueue(
      [{
        exchangeId: 1, slug: null, documentNo: "TKF-1", date: DUE_PAST,
        customerName: "A", receiptNumber: null, dueDate: DUE_PAST, deletedAt: null,
        invoices: [{
          salesInvoiceId: 1, exchangedAmount: 1_000_000, grandTotal: 1_000_000,
          paidAmount: 999_999.5, status: "partial", deletedAt: null, returnCredit: 0,
        }],
      }],
      NOW,
    )
    expect(overdue.rows).toEqual([])
    const totals = buildAgingTotals([{ party: "A", documentNo: "INV-1", dueDate: DUE_PAST, outstanding: 0.5 }], () => "x", ["x"])
    expect(totals.grandTotal).toBe(0.5)
  })

  it("E130-2: sisa 1,01 -> partial, di antrean dan aging, nominal utuh", () => {
    expect(settlementStatus(1_000_000, 999_998.99)).toBe("partial")
    const queue = buildCollectionQueue(
      [{
        invoiceId: 2, documentNo: "INV-2", status: "posted", deletedAt: null,
        date: DUE_PAST, dueDate: DUE_FUTURE, grandTotal: 1_000_000,
        paidAmount: 999_998.99, customerId: 1, customerName: "A",
        customerPhone: null, contactPerson: null,
      }],
      [], [],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.invoiceId)).toEqual([2])
    expect(queue.rows[0].sisa).toBe(1.01)
    const statement = buildCustomerStatement({
      customerId: 1, periodStart: D("2026-10-01"), periodEnd: D("2026-10-31"),
      invoices: [{ id: 2, documentNo: "INV-2", date: DUE_PAST, dueDate: DUE_PAST, grandTotal: 1_000_000 }],
      payments: [{
        id: 12, documentNo: "PAY-12", salesInvoiceId: 2,
        salesInvoiceDocumentNo: "INV-2", paymentDate: D("2026-10-21"),
        amount: 999_998.99, withholdingAmount: 0, paymentMethod: "transfer",
      }],
    })
    expect(statement.entries.find((e) => e.kind === "invoice")?.isOverdue).toBe(true)
  })

  it("E130-1 (layar aging): sisa 0,50 tidak jadi baris; 1,01 jadi baris nominal utuh", () => {
    const lunas = buildAgingRows(
      [
        { party: "A", documentNo: "INV-LUNAS", dueDate: DUE_PAST, grandTotal: 1_000_000, paidAmount: 999_999.5 },
        { party: "A", documentNo: "INV-BUKA", dueDate: DUE_PAST, grandTotal: 1_000_000, paidAmount: 999_998.99 },
      ],
      NOW,
    )
    expect(lunas.map((r) => r.documentNo)).toEqual(["INV-BUKA"])
    expect(lunas[0].outstanding).toBe(1.01)
  })

  it("E130-3 (layar): grandTotal 0/negatif tetap keluar lewat gerbang sisa", () => {
    const rows = buildAgingRows(
      [
        { party: "A", documentNo: "INV-0", dueDate: DUE_PAST, grandTotal: 0, paidAmount: 0 },
        { party: "A", documentNo: "INV-NEG", dueDate: DUE_PAST, grandTotal: -100, paidAmount: 0 },
      ],
      NOW,
    )
    expect(rows).toEqual([])
  })

  it("E130-3: grandTotal 0/negatif tetap keluar aging/antrean walau isSettled false", () => {
    const queue = buildCollectionQueue(
      [
        {
          invoiceId: 3, documentNo: "INV-0", status: "posted", deletedAt: null,
          date: DUE_PAST, dueDate: DUE_PAST, grandTotal: 0,
          paidAmount: 0, customerId: 1, customerName: "A",
          customerPhone: null, contactPerson: null,
        },
        {
          invoiceId: 4, documentNo: "INV-NEG", status: "posted", deletedAt: null,
          date: DUE_PAST, dueDate: DUE_PAST, grandTotal: -100,
          paidAmount: 0, customerId: 1, customerName: "A",
          customerPhone: null, contactPerson: null,
        },
      ],
      [], [],
      { now: NOW },
    )
    expect(queue.rows).toEqual([])
    const queue2 = buildDeliveredUnbilledQueue(
      [{
        salesOrderId: 1, slug: null, documentNo: "SO-1", status: "confirmed",
        deletedAt: null, date: DUE_PAST, customerName: "A",
        lines: [{ lineId: 1, deliveredQty: 10, unitPrice: 100_000 }],
        deliveries: [{ status: "delivered", date: DUE_PAST, confirmedAt: DUE_PAST, deliveredAt: DUE_PAST, deliveredQty: 10 }],
        invoices: [{ salesOrderId: 1, status: "posted", deletedAt: null, grandTotal: 999_999.5 }],
      }],
      NOW,
      FULFILLABLE_ORDER_STATUSES,
    )
    expect(queue2.rows).toEqual([])
    const queue3 = buildDeliveredUnbilledQueue(
      [{
        salesOrderId: 1, slug: null, documentNo: "SO-1", status: "confirmed",
        deletedAt: null, date: DUE_PAST, customerName: "A",
        lines: [{ lineId: 1, deliveredQty: 10, unitPrice: 100_000 }],
        deliveries: [{ status: "delivered", date: DUE_PAST, confirmedAt: DUE_PAST, deliveredAt: DUE_PAST, deliveredQty: 10 }],
        invoices: [{ salesOrderId: 1, status: "posted", deletedAt: null, grandTotal: 999_998.99 }],
      }],
      NOW,
      FULFILLABLE_ORDER_STATUSES,
    )
    expect(queue3.rows).toHaveLength(1)
    expect(queue3.rows[0].unbilledValue).toBe(1.01)
  })
})

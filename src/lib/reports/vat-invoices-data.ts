/**
 * Pemuatan data untuk laporan **Faktur SPT Masa PPN**.
 *
 * Hanya dokumen berstatus posted/partial/paid yang dibaca — draft belum menjadi
 * faktur — dan hanya yang benar-benar ber-PPN (`taxAmount`/`tax` > 0), karena
 * yang masuk SPT Masa PPN adalah faktur pajak. Definisi PPN dokumen sama dengan
 * `rekonsiliasi-ppn` supaya kedua laporan tidak bertentangan.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildVatInvoiceList,
  type VatInvoiceInput,
  type VatInvoiceListResult,
} from "@/lib/reports/vat-invoices"
import { safeSubtract, type SafeMathInput } from "@/lib/utils/math"
import { rangePeriodLabels } from "@/lib/reports/period-label"

/** DPP = subtotal − diskon, presisi sen (bukan float mentah). */
export function vatDpp(subtotal: SafeMathInput, discount: SafeMathInput): number {
  return safeSubtract(subtotal, discount, 2)
}

export interface VatInvoiceReport {
  report: VatInvoiceListResult
  periodLabel: string
  periodCaption: string
}

const RECOGNISED_STATUSES = ["posted", "partial", "paid"] as const

export async function loadVatInvoices(period: {
  start: Date
  end: Date
}): Promise<VatInvoiceReport> {
  const [salesInvoices, vendorBills] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: [...RECOGNISED_STATUSES] },
        deletedAt: null,
        taxAmount: { gt: 0 },
      },
      select: {
        documentNo: true,
        taxInvoiceNumber: true,
        date: true,
        subtotal: true,
        discount: true,
        taxAmount: true,
        grandTotal: true,
        customer: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.vendorBill.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: [...RECOGNISED_STATUSES] },
        deletedAt: null,
        tax: { gt: 0 },
      },
      select: {
        documentNo: true,
        taxInvoiceNumber: true,
        date: true,
        subtotal: true,
        discountAmount: true,
        tax: true,
        grandTotal: true,
        vendor: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    }),
  ])

  const output: VatInvoiceInput[] = salesInvoices.map((invoice) => ({
    date: invoice.date,
    documentNo: invoice.documentNo,
    taxInvoiceNumber: invoice.taxInvoiceNumber,
    counterparty: invoice.customer.name,
    dpp: vatDpp(invoice.subtotal, invoice.discount),
    vat: Number(invoice.taxAmount),
    total: Number(invoice.grandTotal),
  }))

  const input: VatInvoiceInput[] = vendorBills.map((bill) => ({
    date: bill.date,
    documentNo: bill.documentNo,
    taxInvoiceNumber: bill.taxInvoiceNumber,
    counterparty: bill.vendor.name,
    dpp: vatDpp(bill.subtotal, bill.discountAmount),
    vat: Number(bill.tax),
    total: Number(bill.grandTotal),
  }))

  return {
    report: buildVatInvoiceList({ output, input }),
    ...rangePeriodLabels(period),
  }
}

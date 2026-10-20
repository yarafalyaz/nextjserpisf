/**
 * Pemuatan data untuk laporan **Faktur SPT Masa PPN**.
 *
 * Hanya dokumen berstatus posted/partial/paid yang dibaca — draft belum menjadi
 * faktur — dan hanya yang benar-benar ber-PPN (`taxAmount`/`tax` > 0), karena
 * yang masuk SPT Masa PPN adalah faktur pajak. Definisi PPN dokumen sama dengan
 * `rekonsiliasi-ppn` supaya kedua laporan tidak bertentangan.
 *
 * NPWP lawan dimuat dari `Customer.taxId` / `Vendor.npwp` (F-2026-10-20-33(a)).
 * Retur terproses hanya menjadi peringatan: retur penjualan tertaut langsung
 * lewat `SalesReturn.salesInvoiceId`; retur pembelian tertaut lewat vendor PO
 * hanya bila vendor itu punya satu tagihan pada periode ini (tautan tak ambigu).
 * Angka retur tidak mengurangi laporan ini — masa & dasar pengurang menunggu
 * vonis F-33(b); tautan retur pembelian eksplisit butuh kolom baru (F-34 inti).
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

type ReturnRef = NonNullable<VatInvoiceInput["returnRef"]>

/**
 * Tautan retur pembelian: PurchaseReturn tidak punya FK ke VendorBill, hanya
 * ke PurchaseOrder. Tautkan hanya bila vendor PO punya tepat satu tagihan pada
 * periode — selain itu ambigu dan tidak ditautkan (tanpa klaim palsu).
 * ponytail: tautan eksplisit menunggu kolom nota retur di F-34 inti.
 */
export function linkPurchaseReturns(
  bills: { documentNo: string; vendorId: number }[],
  returns: { documentNo: string; purchaseOrder: { documentNo: string; vendorId: number } }[],
): Map<string, ReturnRef> {
  const byVendor = new Map<number, string[]>()
  for (const bill of bills) {
    byVendor.set(bill.vendorId, [...(byVendor.get(bill.vendorId) ?? []), bill.documentNo])
  }
  const linked = new Map<string, ReturnRef>()
  for (const ret of returns) {
    const candidates = byVendor.get(ret.purchaseOrder.vendorId) ?? []
    if (candidates.length !== 1) continue
    linked.set(candidates[0], {
      documentNo: ret.documentNo,
      sourceDocumentNo: ret.purchaseOrder.documentNo,
    })
  }
  return linked
}

export async function loadVatInvoices(period: {
  start: Date
  end: Date
}): Promise<VatInvoiceReport> {
  const [salesInvoices, vendorBills, salesReturns, purchaseReturns] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: [...RECOGNISED_STATUSES] },
        deletedAt: null,
        taxAmount: { gt: 0 },
      },
      select: {
        id: true,
        documentNo: true,
        taxInvoiceNumber: true,
        date: true,
        subtotal: true,
        discount: true,
        taxAmount: true,
        grandTotal: true,
        customer: { select: { name: true, taxId: true } },
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
        vendor: { select: { name: true, npwp: true } },
        vendorId: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.salesReturn.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: "completed",
        salesInvoiceId: { not: null },
      },
      select: {
        documentNo: true,
        salesInvoiceId: true,
        salesInvoice: { select: { documentNo: true } },
      },
    }),
    prisma.purchaseReturn.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: "returned",
      },
      select: {
        documentNo: true,
        purchaseOrder: { select: { documentNo: true, vendorId: true } },
      },
    }),
  ])

  const salesReturnByInvoice = new Map<number, ReturnRef>()
  for (const ret of salesReturns) {
    if (ret.salesInvoiceId == null) continue
    salesReturnByInvoice.set(ret.salesInvoiceId, {
      documentNo: ret.documentNo,
      sourceDocumentNo: ret.salesInvoice?.documentNo ?? null,
    })
  }
  const purchaseReturnByBill = linkPurchaseReturns(vendorBills, purchaseReturns)

  const output: VatInvoiceInput[] = salesInvoices.map((invoice) => ({
    date: invoice.date,
    documentNo: invoice.documentNo,
    taxInvoiceNumber: invoice.taxInvoiceNumber,
    counterparty: invoice.customer.name,
    npwp: invoice.customer.taxId,
    dpp: vatDpp(invoice.subtotal, invoice.discount),
    vat: Number(invoice.taxAmount),
    total: Number(invoice.grandTotal),
    returnRef: salesReturnByInvoice.get(invoice.id) ?? null,
  }))

  const input: VatInvoiceInput[] = vendorBills.map((bill) => ({
    date: bill.date,
    documentNo: bill.documentNo,
    taxInvoiceNumber: bill.taxInvoiceNumber,
    counterparty: bill.vendor.name,
    npwp: bill.vendor.npwp,
    dpp: vatDpp(bill.subtotal, bill.discountAmount),
    vat: Number(bill.tax),
    total: Number(bill.grandTotal),
    returnRef: purchaseReturnByBill.get(bill.documentNo) ?? null,
  }))

  return {
    report: buildVatInvoiceList({ output, input }),
    ...rangePeriodLabels(period),
  }
}

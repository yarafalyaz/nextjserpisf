/**
 * Pemuatan data untuk laporan **Faktur SPT Masa PPN**.
 *
 * Hanya dokumen berstatus posted/partial/paid yang dibaca — draft belum menjadi
 * faktur — dan hanya yang benar-benar ber-PPN (`taxAmount`/`tax` > 0), karena
 * yang masuk SPT Masa PPN adalah faktur pajak. Definisi PPN dokumen sama dengan
 * `rekonsiliasi-ppn` supaya kedua laporan tidak bertentangan.
 *
 * NPWP lawan dimuat dari `Customer.taxId` / `Vendor.npwp` (F-2026-10-20-33(a)).
 * Retur terproses menjadi peringatan pada baris faktur asal; pengurang
 * masa retur (F-2026-10-20-61, vonis Salsa 18:41): baris terpisah per nota
 * retur penjualan completed bertanggal pada masa ini, DPP=Σ qty×price beku,
 * PPN=DPP×tarif efektif faktur asal, posisi PPN memakai keluaran neto.
 * Sisi beli belum jadi pengurang: PurchaseReturnItem hanya cost dan tautan
 * ke VendorBill ambigu (F-34 inti ditunda-teknis).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildVatInvoiceList,
  computeReturnDeduction,
  type VatInvoiceInput,
  type VatInvoiceListResult,
  type VatReturnDeductionInput,
} from "@/lib/reports/vat-invoices"
import { safeSubtract, type SafeMathInput } from "@/lib/utils/math"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"

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
        date: true,
        salesInvoiceId: true,
        salesInvoice: {
          select: { documentNo: true, subtotal: true, discount: true, taxAmount: true, customer: { select: { name: true } } },
        },
        items: { select: { qty: true, price: true } },
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
    documentNo: salesInvoiceLabel(invoice),
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

  // Pengurang masa retur (F-2026-10-20-61): baris per retur pada masa tanggal
  // retur; faktur asal bisa dari masa lain. Retur tanpa faktur asal (tanpa
  // salesInvoiceId) tidak ikut — query di atas mewajibkannya; PPN-retur 0 bila
  // faktur asal tanpa PPN (vonis Salsa). Retur ber-nota kredit: belum ada model
  // SalesCreditNote di repo, jadi belum ada yang diabaikan di sini.
  const returnDeductions: VatReturnDeductionInput[] = salesReturns.map((ret) => {
    let dpp = 0
    let vat = 0
    for (const item of ret.items) {
      const r = computeReturnDeduction({
        qty: Number(item.qty),
        price: Number(item.price),
        source: ret.salesInvoice
          ? {
              subtotal: Number(ret.salesInvoice.subtotal),
              discount: Number(ret.salesInvoice.discount),
              taxAmount: Number(ret.salesInvoice.taxAmount),
            }
          : null,
      })
      dpp += r.dpp
      vat += r.vat
    }
    return {
      date: ret.date,
      documentNo: ret.documentNo,
      sourceDocumentNo: ret.salesInvoice?.documentNo ?? null,
      counterparty: ret.salesInvoice?.customer.name ?? "–",
      dpp,
      vat,
    }
  })

  return {
    report: buildVatInvoiceList({ output, input, returnDeductions }),
    ...rangePeriodLabels(period),
  }
}

/**
 * Loader read-only panel dokumen denda piutang (F-2026-10-22-093-V).
 *
 * Izin `view_sales_late_fees` ditegakkan di loader ini (server,
 * fail-closed) sebelum query apa pun. Angka dari builder
 * `sales-late-fee.ts` apa adanya — loader tidak menghitung denda.
 * Opsi form (akun kas/bank aktif + metode bayar aktif) hanya untuk
 * form pembayaran dokumen denda.
 */

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import {
  buildSalesLateFeePanel,
  type SalesLateFeePanelData,
} from "@/lib/reports/sales-late-fee"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"

export interface SalesLateFeePanelBundle {
  panel: SalesLateFeePanelData
  accounts: { id: number; code: string; name: string }[]
  paymentMethods: { code: string; name: string }[]
}

export async function getSalesLateFeePanelForInvoice(
  salesInvoiceId: number,
): Promise<SalesLateFeePanelBundle | null> {
  await requirePermission("view_sales_late_fees")

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: salesInvoiceId, deletedAt: null },
    select: {
      id: true,
      documentNo: true,
      customerId: true,
      customer: { select: { name: true } },
    },
  })
  if (!invoice) return null

  const [documents, terms, settings, accounts, paymentMethods] =
    await Promise.all([
      prisma.salesLateFee.findMany({
        where: { salesInvoiceId: invoice.id, deletedAt: null },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        select: {
          id: true,
          documentNo: true,
          date: true,
          dueReferenceDate: true,
          overdueDays: true,
          basisAmount: true,
          ratePercentPerDay: true,
          flatAmountPerDay: true,
          capAmount: true,
          amount: true,
          paidAmount: true,
          status: true,
          reversesId: true,
          notes: true,
          payments: {
            orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
            select: {
              id: true,
              documentNo: true,
              amount: true,
              paymentDate: true,
              paymentMethod: true,
              referenceNo: true,
            },
          },
        },
      }),
      prisma.customerLateFeeTerm.findMany({
        where: { customerId: invoice.customerId },
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        select: {
          id: true,
          ratePercentPerDay: true,
          flatAmountPerDay: true,
          capAmount: true,
          effectiveFrom: true,
          effectiveTo: true,
          notes: true,
        },
      }),
      prisma.systemSetting.findFirst({
        select: { lateFeeIncomeAccountId: true },
      }),
      prisma.account.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      prisma.paymentMethod.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { code: true, name: true },
      }),
    ])

  return {
    panel: buildSalesLateFeePanel({
      salesInvoiceId: invoice.id,
      invoiceDocumentNo: salesInvoiceLabel(invoice),
      customerId: invoice.customerId,
      customerName: invoice.customer.name,
      documents: documents.map((doc) => ({
        id: doc.id,
        documentNo: doc.documentNo,
        date: doc.date,
        dueReferenceDate: doc.dueReferenceDate,
        overdueDays: doc.overdueDays,
        basisAmount: Number(doc.basisAmount),
        ratePercentPerDay:
          doc.ratePercentPerDay == null ? null : Number(doc.ratePercentPerDay),
        flatAmountPerDay:
          doc.flatAmountPerDay == null ? null : Number(doc.flatAmountPerDay),
        capAmount: doc.capAmount == null ? null : Number(doc.capAmount),
        amount: Number(doc.amount),
        paidAmount: Number(doc.paidAmount),
        status: doc.status,
        reversesId: doc.reversesId,
        notes: doc.notes,
        payments: doc.payments.map((payment) => ({
          id: payment.id,
          documentNo: payment.documentNo,
          amount: Number(payment.amount),
          paymentDate: payment.paymentDate,
          paymentMethod: payment.paymentMethod,
          referenceNo: payment.referenceNo,
        })),
      })),
      terms: terms.map((term) => ({
        id: term.id,
        ratePercentPerDay:
          term.ratePercentPerDay == null ? null : Number(term.ratePercentPerDay),
        flatAmountPerDay:
          term.flatAmountPerDay == null ? null : Number(term.flatAmountPerDay),
        capAmount: term.capAmount == null ? null : Number(term.capAmount),
        effectiveFrom: term.effectiveFrom,
        effectiveTo: term.effectiveTo,
        notes: term.notes,
      })),
      lateFeeIncomeAccountSet: settings?.lateFeeIncomeAccountId != null,
    }),
    accounts,
    paymentMethods,
  }
}

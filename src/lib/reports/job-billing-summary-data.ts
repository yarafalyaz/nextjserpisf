/**
 * Loader read-model ringkasan tagihan pekerjaan (F-2026-10-20-03).
 *
 * Tiga query untuk satu quotation — quotation, invoice terkait, DP
 * terkonfirmasi — tanpa N+1. Invoice dikumpulkan dari TIGA jembatan
 * existing karena SalesInvoice tidak punya workOrderId (schema:1135):
 * quotationId langsung, salesOrderId lewat SalesOrder.quotationId, dan
 * projectId lewat WorkOrder.projectId untuk daftar WO. Hasil di-dedup
 * per id invoice (satu invoice bisa terjangkau dua jembatan).
 *
 * Fungsi ini TIDAK mengubah down-payment.hook / ambang 50% dan tidak
 * menambah billingKind/paymentScheduleId — inti termin tetap
 * ditunda-teknis (PUTUSAN manager F-2026-10-20-03).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildJobBillingSummary,
  type JobBillingSummary,
} from "@/lib/reports/job-billing-summary"

export type { JobBillingSummary } from "@/lib/reports/job-billing-summary"
export { buildJobBillingSummary } from "@/lib/reports/job-billing-summary"

export interface JobBillingWorkOrderRef {
  id: number
  documentNo: string
  projectId: number | null
}

export interface JobBillingSummaryResult extends JobBillingSummary {
  workOrders: JobBillingWorkOrderRef[]
}

export async function loadJobBillingSummary(
  quotationId: number,
): Promise<JobBillingSummaryResult | null> {
  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, deletedAt: null },
    select: { id: true, documentNo: true, grandTotal: true },
  })
  if (!quotation) return null

  const [salesOrders, workOrders, directInvoices, confirmedDownPayments] =
    await Promise.all([
      prisma.salesOrder.findMany({
        where: { quotationId, deletedAt: null },
        select: { id: true },
      }),
      prisma.workOrder.findMany({
        where: { quotationId },
        select: { id: true, documentNo: true, projectId: true },
        orderBy: { id: "asc" },
      }),
      prisma.salesInvoice.findMany({
        where: { quotationId, deletedAt: null },
        select: {
          id: true,
          documentNo: true,
          status: true,
          grandTotal: true,
          paidAmount: true,
          deletedAt: true,
        },
      }),
      prisma.downPayment.findMany({
        where: { quotationId, status: "confirmed" },
        select: { amount: true },
      }),
    ])

  const salesOrderIds = salesOrders.map((s) => s.id)
  const projectIds = [
    ...new Set(
      workOrders
        .map((w) => w.projectId)
        .filter((p): p is number => p !== null),
    ),
  ]

  const [viaSalesOrder, viaProject] = await Promise.all([
    salesOrderIds.length === 0
      ? Promise.resolve([])
      : prisma.salesInvoice.findMany({
          where: { salesOrderId: { in: salesOrderIds }, deletedAt: null },
          select: {
            id: true,
            documentNo: true,
            status: true,
            grandTotal: true,
            paidAmount: true,
            deletedAt: true,
          },
        }),
    projectIds.length === 0
      ? Promise.resolve([])
      : prisma.salesInvoice.findMany({
          where: { projectId: { in: projectIds }, deletedAt: null },
          select: {
            id: true,
            documentNo: true,
            status: true,
            grandTotal: true,
            paidAmount: true,
            deletedAt: true,
          },
        }),
  ])

  const byId = new Map<number, (typeof directInvoices)[number]>()
  for (const inv of [...directInvoices, ...viaSalesOrder, ...viaProject]) {
    byId.set(inv.id, inv)
  }

  const summary = buildJobBillingSummary({
    quotationId: quotation.id,
    quotationDocumentNo: quotation.documentNo,
    nilaiBerjalan: Number(quotation.grandTotal),
    invoices: [...byId.values()].map((inv) => ({
      id: inv.id,
      documentNo: inv.documentNo,
      status: String(inv.status),
      grandTotal: Number(inv.grandTotal),
      paidAmount: Number(inv.paidAmount),
      deletedAt: inv.deletedAt,
    })),
    confirmedDownPayments: confirmedDownPayments.map((d) => ({
      amount: Number(d.amount),
    })),
  })

  return { ...summary, workOrders }
}

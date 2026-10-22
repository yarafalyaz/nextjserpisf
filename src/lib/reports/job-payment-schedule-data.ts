/**
 * Loader jadwal termin per Quotation — F-2026-10-22-067-S inti.
 *
 * Membaca jadwal aktif (status "aktif") + Quotation.grandTotal
 * berjalan + invoice tiga jembatan yang sama dengan loader ringkasan
 * tagihan (quotationId langsung, salesOrderId lewat SalesOrder,
 * projectId lewat WorkOrder.projectId; dedup per id invoice), lalu
 * menyerahkan seluruh hitungan ke builder murni
 * buildJobPaymentScheduleView. Tanpa jadwal aktif -> null (kartu
 * existing tampil persis seperti hari ini, BR-TM67-09).
 *
 * Loader ini TIDAK membaca DownPayment sama sekali: DP bukan ukuran
 * terpenuhi (vonis F-03 + AC-TM67-3). Tidak menulis apa pun.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildJobPaymentScheduleView,
  JOB_PAYMENT_SCHEDULE_LABEL,
  type JobPaymentScheduleView,
} from "@/lib/reports/job-payment-schedule"

export { JOB_PAYMENT_SCHEDULE_LABEL }
export type { JobPaymentScheduleView }

export interface JobPaymentScheduleResult extends JobPaymentScheduleView {
  /** Label jujur kartu (AC-TM67-6): beda dari jatuh tempo invoice. */
  scheduleLabel: typeof JOB_PAYMENT_SCHEDULE_LABEL
}

export async function loadJobPaymentSchedule(
  quotationId: number,
  now: Date = new Date(),
): Promise<JobPaymentScheduleResult | null> {
  const [quotation, schedule] = await Promise.all([
    prisma.quotation.findFirst({
      where: { id: quotationId, deletedAt: null },
      select: { id: true, grandTotal: true },
    }),
    prisma.jobPaymentSchedule.findFirst({
      where: { quotationId, status: "aktif" },
      select: {
        id: true,
        terms: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            cumulativePercent: true,
            dueDate: true,
            milestoneLabel: true,
            sortOrder: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
  ])
  if (!quotation || !schedule) return null

  const [salesOrders, workOrders, directInvoices] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { quotationId, deletedAt: null },
      select: { id: true },
    }),
    prisma.workOrder.findMany({
      where: { quotationId },
      select: { projectId: true },
    }),
    prisma.salesInvoice.findMany({
      where: { quotationId, deletedAt: null },
      select: { id: true, status: true, grandTotal: true },
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
          select: { id: true, status: true, grandTotal: true },
        }),
    projectIds.length === 0
      ? Promise.resolve([])
      : prisma.salesInvoice.findMany({
          where: { projectId: { in: projectIds }, deletedAt: null },
          select: { id: true, status: true, grandTotal: true },
        }),
  ])

  const byId = new Map<number, (typeof directInvoices)[number]>()
  for (const inv of [...directInvoices, ...viaSalesOrder, ...viaProject]) {
    byId.set(inv.id, inv)
  }

  const view = buildJobPaymentScheduleView({
    scheduleId: schedule.id,
    quotationId: quotation.id,
    quotationGrandTotal: Number(quotation.grandTotal),
    terms: schedule.terms.map((t) => ({
      id: t.id,
      name: t.name,
      cumulativePercent: Number(t.cumulativePercent),
      dueDate: t.dueDate,
      milestoneLabel: t.milestoneLabel,
      sortOrder: t.sortOrder,
    })),
    invoices: [...byId.values()].map((inv) => ({
      id: inv.id,
      status: inv.status,
      grandTotal: Number(inv.grandTotal),
    })),
    now,
  })

  return { ...view, scheduleLabel: JOB_PAYMENT_SCHEDULE_LABEL }
}

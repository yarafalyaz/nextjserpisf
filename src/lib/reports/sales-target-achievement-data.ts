/**
 * Loader read-only target vs pencapaian penjualan (F-2026-10-22-088-S
 * tahap 1). Dua query massal: target aktif (deletedAt null) yang
 * bersinggungan rentang laporan + faktur paid dalam cakupan gabungan
 * (periode target ∪ rentang laporan).
 *
 * BASIS IDENTIK rekap komisi (BR-TGT-01): faktur yang dimuat memakai
 * filter yang sama persis dengan sales-commission-data.ts — status
 * "paid", deletedAt null, `date` dalam jendela, snapshot
 * salesEmployeeId. AC-TGT-10 mengunci pencapaian == paidBase komisi.
 *
 * Lencana "Target diubah" (BR-TGT-09) diturunkan dari ActivityLog
 * sales_target_updated terakhir per target yang jatuh sesudah
 * periodStart target itu — laporan memakai nilai target terkini.
 * Read-only: tanpa migrasi/jurnal/mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildSalesTargetAchievement,
  type SalesTargetAchievement,
} from "@/lib/reports/sales-target-achievement"

export async function getSalesTargetAchievement(range: {
  start: Date
  end: Date
}): Promise<SalesTargetAchievement> {
  const targets = await prisma.salesTarget.findMany({
    where: {
      deletedAt: null,
      periodStart: { lte: range.end },
      periodEnd: { gte: range.start },
    },
    select: {
      id: true,
      salesEmployeeId: true,
      periodStart: true,
      periodEnd: true,
      targetAmount: true,
      notes: true,
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ periodStart: "asc" }, { id: "asc" }],
  })

  // Cakupan faktur: gabungan periode target + rentang laporan supaya
  // pencapaian periode target utuh DAN ember rentang sama-sama terisi.
  let coverageStart = range.start
  let coverageEnd = range.end
  for (const t of targets) {
    if (t.periodStart.getTime() < coverageStart.getTime()) coverageStart = t.periodStart
    if (t.periodEnd.getTime() > coverageEnd.getTime()) coverageEnd = t.periodEnd
  }
  // periodEnd disimpan tengah malam UTC: jendela faktur menutup akhir
  // hari itu (inklusif), pola loader komisi endDate.setHours(23:59:59).
  const invoiceEnd = new Date(coverageEnd.getTime() + 24 * 3_600_000 - 1)

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      deletedAt: null,
      status: "paid",
      date: { gte: coverageStart, lte: invoiceEnd },
    },
    select: {
      salesEmployeeId: true,
      date: true,
      grandTotal: true,
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })

  // BR-TGT-09: perubahan terakhir per target. Query massal tunggal.
  const targetIds = targets.map((t) => t.id)
  const updatedBy: Record<number, Date> = {}
  if (targetIds.length > 0) {
    const logs = await prisma.activityLog.findMany({
      where: {
        modelType: "SalesTarget",
        action: "sales_target_updated",
        modelId: { in: targetIds },
      },
      select: { modelId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
    for (const log of logs) {
      if (log.modelId !== null && updatedBy[log.modelId] === undefined) {
        updatedBy[log.modelId] = log.createdAt
      }
    }
  }

  return buildSalesTargetAchievement({
    range,
    targets: targets.map((t) => {
      const lastUpdated: Date | undefined = updatedBy[t.id]
      return {
        id: t.id,
        salesEmployeeId: t.salesEmployeeId,
        salesEmployeeName: t.salesEmployee.name,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        targetAmount: Number(t.targetAmount),
        notes: t.notes,
        modifiedAfterPeriodStartAt:
          lastUpdated !== undefined && lastUpdated.getTime() >= t.periodStart.getTime()
            ? lastUpdated
            : null,
      }
    }),
    invoices: invoices.map((inv) => ({
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: inv.salesEmployee?.name ?? null,
      date: inv.date,
      grandTotal: Number(inv.grandTotal),
    })),
  })
}

/** Daftar target aktif untuk form kelola (gerbang di pemanggil). */
export async function listSalesTargets() {
  return prisma.salesTarget.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      salesEmployeeId: true,
      periodStart: true,
      periodEnd: true,
      targetAmount: true,
      notes: true,
      updatedAt: true,
      salesEmployee: { select: { name: true, isActive: true } },
    },
    orderBy: [{ periodStart: "desc" }, { id: "desc" }],
  })
}

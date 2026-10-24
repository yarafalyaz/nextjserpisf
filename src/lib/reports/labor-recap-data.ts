/**
 * Loader read-only rekap upah borongan (F-2026-10-20-97a, tahap backend aman).
 *
 * Dua query massal saja (baris labor + timesheet yang dirujuk), tanpa N+1,
 * tanpa mutasi, tanpa jurnal, tanpa membuat baris payroll. Atribusi teknisi
 * hanya lewat `ProductionCost.sourceTimesheetId -> Timesheet.employeeId`;
 * baris labor manual tanpa sumber dikirim sebagai tanpa teknisi agar builder
 * menampilkannya di kelompok terpisah. Agregasinya di builder murni
 * `labor-recap.ts`.
 */

import { prisma } from "@/lib/db/prisma"
import { buildLaborRecap, type LaborRecap } from "@/lib/reports/labor-recap"

export async function getLaborRecap(period?: {
  start: Date
  end: Date
}): Promise<LaborRecap> {
  const costs = await prisma.productionCost.findMany({
    where: { category: "labor" },
    select: { sourceTimesheetId: true, hours: true, amount: true },
    orderBy: [{ id: "asc" }],
  })

  const timesheetIds = [
    ...new Set(
      costs
        .map((cost) => cost.sourceTimesheetId)
        .filter((id): id is number => id !== null),
    ),
  ]

  const timesheets =
    timesheetIds.length === 0
      ? []
      : await prisma.timesheet.findMany({
          where: { id: { in: timesheetIds } },
          select: {
            id: true,
            employeeId: true,
            date: true,
            employee: { select: { name: true } },
          },
        })
  const employeeByTimesheet = new Map(
    timesheets.map((t) => [
      t.id,
      { employeeId: t.employeeId, name: t.employee.name, date: t.date },
    ]),
  )

  return buildLaborRecap(
    costs.map((cost) => {
      const linked =
        cost.sourceTimesheetId === null
          ? undefined
          : employeeByTimesheet.get(cost.sourceTimesheetId)
      return {
        employeeId: linked?.employeeId ?? null,
        employeeName: linked?.name ?? null,
        category: "labor",
        hours: cost.hours === null ? null : Number(cost.hours),
        amount: Number(cost.amount),
        // F-038: tanggal kerja hanya dari Timesheet.date; tanpa itu null.
        workDate: linked ? new Date(linked.date) : null,
      }
    }),
    period,
  )
}

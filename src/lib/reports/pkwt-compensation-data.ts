/**
 * Loader read-model kompensasi PKWT (F-2026-10-24-132-V Putusan 5):
 * rekonsiliasi 3 arah (peristiwa ↔ GL 210207 ↔ slip terbayar) + daftar
 * belum dibayar. Pure builder: pkwt-compensation.ts.
 *
 * Data terikat karyawan selalu dibatasi scope HR pemanggil. GL 210207
 * adalah akun perusahaan tanpa dimensi karyawan, jadi tidak bisa dibagi
 * per scope; untuk scope terbatas, anomali GL-vs-peristiwa ditahan karena
 * membandingkan saldo perusahaan dengan subledger sebagian selalu semu.
 */
import { prisma } from "@/lib/db/prisma"
import { hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildPkwtCompensationReport,
  type PkwtCompensationReport,
  buildPkwtUnpaidList,
  PKWT_MSG,
} from "@/lib/reports/pkwt-compensation"

export async function getPkwtCompensationReport(
  scope: HrScope,
): Promise<PkwtCompensationReport> {
  const employeeScope = hrScopeWhere(scope)
  const settings = await prisma.systemSetting.findFirst({
    select: {
      pkwtCompensationExpenseAccountId: true,
      pkwtCompensationPayableAccountId: true,
    },
  })
  const payableAccountId = settings?.pkwtCompensationPayableAccountId ?? null
  const expenseAccountId = settings?.pkwtCompensationExpenseAccountId ?? null
  const mappingMissing = !payableAccountId || !expenseAccountId

  const [events, accrualAgg, paidLines, glRows, pendingSlips] = await Promise.all([
    prisma.pkwtCompensationEvent.findMany({
      where: employeeScope,
      orderBy: [{ employeeId: "asc" }, { segmentStart: "asc" }],
      include: { employee: { select: { name: true, employeeNumber: true } } },
    }),
    prisma.pkwtCompensationAccrual.groupBy({
      by: ["employeeId", "segmentStart"],
      where: employeeScope,
      _sum: { amount: true },
    }),
    prisma.payrollComponentLine.findMany({
      where: { pkwtEventId: { not: null }, payroll: employeeScope },
      select: { pkwtEventId: true, amount: true, payroll: { select: { status: true } } },
    }),
    payableAccountId
      ? prisma.journalEntry.findMany({
          where: { accountId: payableAccountId, journal: { status: "POSTED" } },
          select: { debit: true, credit: true },
        })
      : Promise.resolve([] as { debit: unknown; credit: unknown }[]),
    prisma.payroll.findMany({
      where: { status: "approved", ...employeeScope },
      select: {
        id: true,
        componentLines: {
          where: { pkwtEventId: { not: null } },
          select: { pkwtEventId: true },
        },
      },
    }),
  ])

  const glBalance = glRows.reduce(
    (s, r) => s + Number(r.credit ?? 0) - Number(r.debit ?? 0),
    0,
  )
  const accrualMap = new Map<string, number>()
  for (const a of accrualAgg) {
    accrualMap.set(`${a.employeeId}|${a.segmentStart.toISOString()}`, Number(a._sum.amount ?? 0))
  }
  const paidMap = new Map<number, number>()
  for (const l of paidLines) {
    if (l.pkwtEventId != null && l.payroll.status === "paid") {
      paidMap.set(l.pkwtEventId, (paidMap.get(l.pkwtEventId) ?? 0) + Number(l.amount))
    }
  }
  const pendingSlipEventIds = new Set<number>()
  for (const p of pendingSlips) {
    for (const l of p.componentLines) {
      if (l.pkwtEventId != null) pendingSlipEventIds.add(l.pkwtEventId)
    }
  }

  const report = buildPkwtCompensationReport({
    events: events.map((e) => ({
      eventId: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee.name,
      segmentStart: e.segmentStart,
      segmentEnd: e.segmentEnd,
      serviceMonths: Number(e.serviceMonths),
      amount: Number(e.amount),
      status: e.status,
      isLegacy: e.isLegacy,
      accruedToDate: accrualMap.get(`${e.employeeId}|${e.segmentStart.toISOString()}`) ?? 0,
      paidAmount: paidMap.get(e.id) ?? 0,
    })),
    glPayableBalance: glBalance,
    mappingMissing,
  })
  if (scope.kind !== "all") {
    report.anomalies = report.anomalies.filter((a) => a.code !== "GL_VS_EVENT_DIFF")
  }
  if (mappingMissing) {
    report.anomalies.push({
      code: "MAPPING_MISSING",
      label: "Mapping belum diisi",
      detail: PKWT_MSG.mappingMissing(),
    })
  }
  report.pendingApprovalSlips = buildPkwtUnpaidList(
    report.rows
      .filter((r) => pendingSlipEventIds.has(r.eventId))
      .map((r) => ({
        employeeId: r.employeeId,
        name: r.employeeName,
        segmentEnd: r.segmentEnd,
        frozenAmount: r.amount,
        paidAmount: r.paidAmount,
      })),
  )
  return report
}

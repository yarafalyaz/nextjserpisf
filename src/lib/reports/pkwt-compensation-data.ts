/**
 * Loader read-model kompensasi PKWT (F-2026-10-24-132-V Putusan 5):
 * rekonsiliasi 3 arah (peristiwa ↔ GL 210207 ↔ slip terbayar) + daftar
 * belum dibayar. Pure builder: pkwt-compensation.ts.
 *
 * Scope HR (utang pasca-merge #724, vonis QA 6384023131): pemanggil wajib
 * meneruskan HrScope dari getHrScope(). Semua query yang mengekspos
 * karyawan (peristiwa, akrual subledger, baris slip terbayar, slip
 * pending-approval) difilter hrScopeWhere(scope) — scope `self` hanya
 * melihat peristiwanya sendiri, `department` hanya se-departemennya.
 *
 * glPayableBalance TIDAK difilter per karyawan: saldo GL 210207 adalah
 * agregat satu-buku perusahaan (satu jurnal akrual agregat per bulan,
 * tanpa dimensi karyawan — lihat runPkwtMonthlyAccrual). Untuk scope
 * terbatas angka itu tetap saldo perusahaan; builder menerimanya dengan
 * glIsCompanyWide=true sehingga selisih terhadap total ter-scope TIDAK
 * diterbitkan sebagai temuan GL_VS_EVENT_DIFF (artefak cakupan, bukan
 * selisih akuntansi), dan report menandai glComparableToScope=false.
 */
import { prisma } from "@/lib/db/prisma"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import { hrScopeWhere, type HrScope } from "@/lib/auth/hr-scope"
import {
  buildPkwtCompensationReport,
  type PkwtCompensationReport,
  buildPkwtUnpaidList,
  PKWT_MSG,
} from "@/lib/reports/pkwt-compensation"

/**
 * Laporan kompensasi PKWT ter-scope. `glPayableBalance` tetap saldo GL
 * satu perusahaan (tidak ter-scope); `glIsCompanyWide` true untuk scope
 * terbatas menandakan angka itu tidak se-cakupan dengan rows/totals, dan
 * `glComparableToScope` false menandakan perbandingan GL vs scope tidak
 * sah diterbitkan sebagai temuan.
 */
export type PkwtCompensationScopedReport = PkwtCompensationReport

export async function getPkwtCompensationReport(
  scope: HrScope,
): Promise<PkwtCompensationScopedReport> {
  const scopeWhere = hrScopeWhere(scope)
  const settings = await prisma.systemSetting.findFirst({
    select: {
      pkwtCompensationExpenseAccountId: true,
      pkwtCompensationPayableAccountId: true,
    },
  })
  const payableAccountId = settings?.pkwtCompensationPayableAccountId ?? null
  const expenseAccountId = settings?.pkwtCompensationExpenseAccountId ?? null
  const mappingMissing = !payableAccountId || !expenseAccountId

  // PayrollComponentLine tidak punya employeeId/employee: scope lewat
  // relasi payroll (karyawan pemilik slip).
  const lineScopeWhere =
    scope.kind === "all"
      ? {}
      : scope.kind === "team"
        ? { payroll: { employeeId: { in: scope.memberIds } } }
        : {
            payroll:
              scope.kind === "self"
                ? { employeeId: scope.employeeId }
                : scope.departmentId == null
                  ? { employeeId: scope.employeeId }
                  : { employee: { departmentId: scope.departmentId } },
          }

  const [events, accrualAgg, paidLines, glRows, pendingSlips] = await Promise.all([
    prisma.pkwtCompensationEvent.findMany({
      where: scopeWhere,
      orderBy: [{ employeeId: "asc" }, { segmentStart: "asc" }],
      include: { employee: { select: { name: true, employeeNumber: true } } },
    }),
    prisma.pkwtCompensationAccrual.groupBy({
      by: ["employeeId", "segmentStart"],
      where: scopeWhere,
      _sum: { amount: true },
    }),
    prisma.payrollComponentLine.findMany({
      where: { pkwtEventId: { not: null }, ...lineScopeWhere },
      select: { pkwtEventId: true, amount: true, payroll: { select: { status: true, employeeId: true } } },
    }),
    payableAccountId
      ? prisma.journalEntry.findMany({
          // Agregasi saldo per akun (kredit−debit di reduce di bawah):
          // POSTED+REVERSED agar pasangan reversal neto nol.
          where: { accountId: payableAccountId, journal: { status: { in: [...REPORT_JOURNAL_STATUSES] }, deletedAt: null } },
          select: { debit: true, credit: true },
        })
      : Promise.resolve([] as { debit: unknown; credit: unknown }[]),
    prisma.payroll.findMany({
      where: { status: "approved", ...scopeWhere },
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
    glIsCompanyWide: scope.kind !== "all",
  })
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

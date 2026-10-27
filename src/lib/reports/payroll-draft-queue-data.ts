/**
 * Loader read-only antrean slip gaji draft mengendap
 * (F-2026-10-26-070-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (PUTUSAN LEAD Q-PDQ-4, BR-PDQ-02/04):
 * izin `process_payroll` ditegakkan di sini (`view_payroll` TIDAK cukup
 * tahap 1 — antena antrean kerja pemroses, bukan laporan), lalu
 * `getHrScope` — scope `self` (termasuk roles rusak/tanpa employee
 * tertaut → employeeId -1) BUKAN populasi antrean proses dan jatuh
 * kosong; hanya department/all yang bermuatan. Halaman pemanggil
 * menegakkan izin juga sebelum loader.
 *
 * Payroll TIDAK punya deletedAt (schema model Payroll) — populasi
 * cukup `status: "draft"` persis + `hrScopeWhere` (BR-PDQ-01); builder
 * menyaring ulang status lapis kedua. Anti-N+1: satu query Payroll
 * (+relasi employee) + satu query User massal nama pembuat — BUKAN
 * query per baris (AC-PDQ-B4). Select TIDAK PERNAH memuat kolom nominal
 * (BR-PDQ-03): baseSalary/netSalary/grossSalary/komponen/potongan/
 * BPJS/PPh21/totalAmount tidak dipilih sama sekali.
 *
 * Baca-saja mutlak (BR-PDQ-07, AC-PDQ-B5): loader hanya `findMany`;
 * tidak memanggil processPayroll/approvePayroll/markPayrollPaid/hapus.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import {
  buildPayrollDraftQueue,
  type PayrollDraftInput,
  type PayrollDraftQueue,
} from "@/lib/reports/payroll-draft-queue"

export interface PayrollDraftQueueOptions {
  /** Tanggal laporan untuk umur hari (diinjeksikan; default sekarang). */
  now?: Date
}

const EMPTY_QUEUE: PayrollDraftQueue = {
  rows: [],
  levelCounts: { mengendap: 0, menunggu: 0 },
  periodCounts: [],
  totalDocuments: 0,
}

export async function getPayrollDraftQueue(
  options: PayrollDraftQueueOptions = {},
): Promise<PayrollDraftQueue> {
  const user = await requirePermission("process_payroll")
  const scope = await getHrScope(user)

  // Scope self bukan populasi antrean proses (BR-PDQ-02) — fail-closed
  // kosong sebelum query, termasuk rekap count (EC-PDQ-7).
  if (scope.kind === "self") return EMPTY_QUEUE

  const slips = await prisma.payroll.findMany({
    where: { status: "draft", ...hrScopeWhere(scope) },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      employeeId: true,
      period: true,
      type: true,
      startDate: true,
      endDate: true,
      createdBy: true,
      createdAt: true,
      employee: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const creatorIds = [
    ...new Set(slips.map((s) => s.createdBy).filter((id): id is number => id != null)),
  ]
  const creators =
    creatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : []
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]))

  const inputs: PayrollDraftInput[] = slips.map((s) => ({
    payrollId: s.id,
    slug: s.slug,
    documentNo: s.documentNo,
    status: s.status,
    employeeId: s.employeeId,
    employeeName: s.employee?.name ?? null,
    period: s.period,
    type: s.type,
    startDate: s.startDate,
    endDate: s.endDate,
    createdByName: s.createdBy != null ? (creatorNameById.get(s.createdBy) ?? null) : null,
    createdAt: s.createdAt,
  }))

  return buildPayrollDraftQueue(inputs, options.now ?? new Date())
}

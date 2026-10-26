/**
 * Loader read-only antrean penilaian kinerja belum selesai per siklus aktif
 * (F-2026-10-27-077-S, PUTUSAN LEAD Q-PFQ-1..8, kartu 077-B).
 *
 * Fail-closed `view_performance` SEBELUM query (Q-PFQ-7, nol key baru),
 * lalu `getHrScope` fail-closed (roles rusak/tanpa employee tertaut → self
 * employeeId -1 → nol baris, AC-PFQ-B4). Empat query massal anti-N+1:
 * siklus `active` tak terhapus, karyawan aktif dalam scope
 * (`hrEmployeeScopeWhere`, pola konsumen #805), review siklus populasi
 * (status draft/self_submitted/manager_reviewed saja — `finalized` dan
 * status liar tidak pernah terbaca), dan pasangan goal [cycleId,
 * employeeId] lewat groupBy — BUKAN query per baris (AC-PFQ-B4).
 *
 * Baca-saja mutlak (BR-PFQ-02, AC-PFQ-B2): loader TIDAK memanggil
 * `ensureReview`, submit, finalize dan tidak create/update review apa pun;
 * antrean tidak pernah menciptakan baris `PerformanceReview`. Select
 * tidak memuat data gaji/payroll, `finalScore`, teks ulasan, atau
 * `reviewerEmployeeId` (BR-PFQ-04/09/10) — payload antrean hanya skor
 * verbatim + fakta ember/umur/penanda dari builder murni
 * `performance-review-queue.ts`. Rekap per siklus dihitung builder dari
 * baris tampil yang sama, sehingga tidak pernah menghitung luar scope.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrEmployeeScopeWhere } from "@/lib/auth/hr-scope"
import {
  buildPerformanceQueue,
  goalPairKey,
  type PerformanceQueue,
  type PerformanceQueueInput,
} from "@/lib/reports/performance-review-queue"

export interface PerformanceQueueLoaderOptions {
  now?: Date
}

export async function getPerformanceQueue(
  options: PerformanceQueueLoaderOptions = {},
): Promise<PerformanceQueue> {
  const user = await requirePermission("view_performance")
  const scope = await getHrScope(user)

  const cycles = await prisma.performanceCycle.findMany({
    where: { status: "active", deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      deletedAt: true,
    },
    orderBy: [{ id: "asc" }],
  })

  const employees = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...hrEmployeeScopeWhere(scope),
    },
    select: { id: true, name: true, deletedAt: true, isActive: true },
    orderBy: [{ id: "asc" }],
  })

  const cycleIds = cycles.map((cycle) => cycle.id)
  const employeeIds = employees.map((employee) => employee.id)

  const [reviews, goalPairsRaw] =
    cycleIds.length > 0 && employeeIds.length > 0
      ? await Promise.all([
          prisma.performanceReview.findMany({
            where: {
              cycleId: { in: cycleIds },
              employeeId: { in: employeeIds },
              status: { in: ["draft", "self_submitted", "manager_reviewed"] },
            },
            select: {
              id: true,
              cycleId: true,
              employeeId: true,
              status: true,
              selfScore: true,
              managerScore: true,
              updatedAt: true,
            },
            orderBy: [{ id: "asc" }],
          }),
          prisma.performanceGoal.groupBy({
            by: ["cycleId", "employeeId"],
            where: {
              cycleId: { in: cycleIds },
              employeeId: { in: employeeIds },
            },
          }),
        ])
      : [[], []]

  const goalPairs = goalPairsRaw.map((pair) =>
    goalPairKey(pair.cycleId, pair.employeeId),
  )

  const inputs: PerformanceQueueInput[] = cycles.map((cycle) => ({
    cycle: {
      cycleId: cycle.id,
      cycleSlug: cycle.slug,
      cycleName: cycle.name,
      cycleStatus: cycle.status,
      cycleDeletedAt: cycle.deletedAt,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
    },
    employees: employees.map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      employeeDeletedAt: employee.deletedAt,
      employeeIsActive: employee.isActive,
    })),
    reviews: reviews
      .filter((review) => review.cycleId === cycle.id)
      .map((review) => ({
        reviewId: review.id,
        cycleId: review.cycleId,
        employeeId: review.employeeId,
        status: review.status,
        selfScore: review.selfScore?.toString() ?? null,
        managerScore: review.managerScore?.toString() ?? null,
        updatedAt: review.updatedAt,
      })),
    goalPairs,
  }))

  return buildPerformanceQueue(inputs, { now: options.now })
}

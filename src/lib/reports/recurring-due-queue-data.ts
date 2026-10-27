/**
 * Loader read-only antrean transaksi berulang jatuh tempo/gagal
 * (F-2026-10-27-103-S tahap 1, awalan RTQ; tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (BR-RCQ103-11): izin tunggal
 * `manage_recurring_transactions` ditegakkan di sini; tanpa izin
 * loader menolak sebelum query. Tanpa scope per pembuat.
 *
 * Select daftar-putih (BR-RCQ103-07): TIDAK PERNAH memuat kolom
 * `template` (JSON nominal+akun) maupun `createdBy`. Anti-N+1:
 * satu query massal populasi.
 *
 * Baca-saja mutlak (BR-RCQ103-06): loader hanya findMany; tidak
 * memanggil runRecurringNow/runAllDueRecurring/runDueRecurring.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildRecurringDueQueue,
  type RecurringDueInput,
  type RecurringDueQueue,
} from "@/lib/reports/recurring-due-queue"

export interface RecurringDueQueueOptions {
  now?: Date
}

export async function getRecurringDueQueue(
  options: RecurringDueQueueOptions = {},
): Promise<RecurringDueQueue> {
  await requirePermission("manage_recurring_transactions")

  const schedules = await prisma.recurringTransaction.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      frequency: true,
      interval: true,
      nextRunDate: true,
      endDate: true,
      lastRunAt: true,
      runCount: true,
      lastResult: true,
      isActive: true,
      deletedAt: true,
    },
    orderBy: [{ nextRunDate: "asc" }, { id: "asc" }],
  })

  const inputs: RecurringDueInput[] = schedules.map((s) => ({
    scheduleId: s.id,
    slug: s.slug,
    name: s.name,
    type: s.type,
    frequency: s.frequency,
    interval: s.interval,
    nextRunDate: s.nextRunDate,
    endDate: s.endDate,
    lastRunAt: s.lastRunAt,
    runCount: s.runCount,
    lastResult: s.lastResult,
    isActive: s.isActive,
    deletedAt: s.deletedAt,
  }))

  return buildRecurringDueQueue(inputs, options.now ?? new Date())
}

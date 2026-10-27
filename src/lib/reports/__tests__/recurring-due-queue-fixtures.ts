import type { RecurringDueInput } from "../recurring-due-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Fixture bersama builder + kartu antrean transaksi berulang 103. Hari acuan = hari WIB dari NOW. */
export const RECURRING_DUE_NOW = new Date("2026-10-25T22:00:00.000Z")

const TODAY = getWibTodayUtcDate(RECURRING_DUE_NOW)

export const recurringDueDay = (offset: number) =>
  new Date(TODAY.getTime() + offset * 86_400_000)

export function recurringDueInput(
  overrides: Partial<RecurringDueInput> = {},
): RecurringDueInput {
  return {
    scheduleId: 1,
    slug: "jadwal-1",
    name: "Jurnal Sewa Bulanan",
    type: "journal",
    frequency: "monthly",
    interval: 1,
    nextRunDate: recurringDueDay(-1),
    endDate: null,
    lastRunAt: recurringDueDay(-30),
    runCount: 3,
    lastResult: "Jurnal DRAFT dibuat",
    isActive: true,
    deletedAt: null,
    ...overrides,
  }
}

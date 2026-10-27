import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  RECURRING_DUE_BUCKET_LABELS,
  RECURRING_DUE_NEVER_RAN_LABEL,
  RECURRING_DUE_NOTICE_TEXT,
  RECURRING_DUE_STALE_DAYS,
  RECURRING_DUE_TITLE,
  buildRecurringDueQueue,
  type RecurringDueInput,
} from "../recurring-due-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  recurringFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { recurringTransaction: { findMany: (...a: unknown[]) => mocks.recurringFindMany(...a) } },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getRecurringDueQueue } from "../recurring-due-queue-data"

const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<RecurringDueInput> = {}): RecurringDueInput {
  return {
    scheduleId: 1,
    slug: "jadwal-1",
    name: "Jurnal Sewa Bulanan",
    type: "journal",
    frequency: "monthly",
    interval: 1,
    nextRunDate: day(-1),
    endDate: null,
    lastRunAt: day(-30),
    runCount: 3,
    lastResult: "Jurnal DRAFT dibuat",
    isActive: true,
    deletedAt: null,
    ...overrides,
  }
}

describe("recurring-due-queue (F-2026-10-27-103-S, RTQ)", () => {
  it("kata verbatim putusan + ambang 3", () => {
    expect(RECURRING_DUE_STALE_DAYS).toBe(3)
    expect(RECURRING_DUE_TITLE).toBe("Transaksi Berulang Jatuh Tempo")
    expect(RECURRING_DUE_BUCKET_LABELS).toEqual({
      GAGAL_JALAN: "Gagal Jalan",
      JATUH_TEMPO_BELUM_JALAN: "Jatuh Tempo Belum Jalan",
    })
    expect(RECURRING_DUE_NEVER_RAN_LABEL).toBe("belum pernah jalan")
    expect(RECURRING_DUE_NOTICE_TEXT).toContain("bukan sejak kegagalan pertama")
  })

  it("AC-RCQ103-B1: nonaktif/terhapus/belum-due/pensiun Berakhir keluar", () => {
    const queue = buildRecurringDueQueue(
      [
        input({ scheduleId: 1 }),
        input({ scheduleId: 2, isActive: false, lastResult: "Berakhir (melewati tanggal akhir)" }),
        input({ scheduleId: 3, deletedAt: day(-1) }),
        input({ scheduleId: 4, nextRunDate: day(1) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.scheduleId)).toEqual([1])
  })

  it("AC-RCQ103-B2: awalan Gagal: = GAGAL_JALAN; null = belum-jalan tertanda; sukses lama due lagi bukan gagal", () => {
    const queue = buildRecurringDueQueue(
      [
        input({ scheduleId: 1, lastResult: "Gagal: Jenis transaksi berulang tidak dikenal" }),
        input({ scheduleId: 2, lastResult: null, lastRunAt: null, runCount: 0 }),
        input({ scheduleId: 3, lastResult: "Jurnal DRAFT dibuat" }),
      ],
      NOW,
    )
    const byId = new Map(queue.rows.map((r) => [r.scheduleId, r]))
    expect(byId.get(1)?.bucket).toBe("GAGAL_JALAN")
    expect(byId.get(1)?.failureMessage).toContain("Gagal:")
    expect(byId.get(2)?.bucket).toBe("JATUH_TEMPO_BELUM_JALAN")
    expect(byId.get(2)?.neverRanLabel).toBe("belum pernah jalan")
    expect(byId.get(3)?.bucket).toBe("JATUH_TEMPO_BELUM_JALAN")
    expect(queue.bucketCounts).toEqual({ GAGAL_JALAN: 1, JATUH_TEMPO_BELUM_JALAN: 2 })
  })

  it("AC-RCQ103-B3: umur hari-WIB dari nextRunDate; hari ini 0; tepat 3 mengendap", () => {
    const queue = buildRecurringDueQueue(
      [
        input({ scheduleId: 1, nextRunDate: day(0) }),
        input({ scheduleId: 2, nextRunDate: day(-3) }),
        input({ scheduleId: 3, nextRunDate: day(-2) }),
      ],
      NOW,
    )
    const byId = new Map(queue.rows.map((r) => [r.scheduleId, r]))
    expect(byId.get(1)?.ageDays).toBe(0)
    expect(byId.get(2)?.level).toBe("mengendap")
    expect(byId.get(3)?.level).toBe("menunggu")
  })

  it("AC-RCQ103-B4: urutan gagal dulu umur terbesar; rekap populasi penuh; terpotong tertanda", () => {
    const queue = buildRecurringDueQueue(
      [
        input({ scheduleId: 1, lastResult: "Gagal: x", nextRunDate: day(-2) }),
        input({ scheduleId: 2, lastResult: "Gagal: x", nextRunDate: day(-9) }),
        input({ scheduleId: 3, lastResult: null, nextRunDate: day(-20) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.scheduleId)).toEqual([2, 1, 3])
    expect(queue.levelCounts).toEqual({ mengendap: 2, menunggu: 1 })
    expect(queue.typeCounts).toEqual({ journal: 3 })
    expect(queue.frequencyCounts).toEqual({ Bulanan: 3 })

    // Seri umur sama: nextRunDate naik, lalu id naik (BR-RCQ103-08).
    const tied = buildRecurringDueQueue(
      [
        input({ scheduleId: 9, lastResult: "Gagal: x", nextRunDate: day(-4) }),
        input({ scheduleId: 7, lastResult: "Gagal: x", nextRunDate: day(-4) }),
      ],
      NOW,
    )
    expect(tied.rows.map((r) => r.scheduleId)).toEqual([7, 9])

    const many = Array.from({ length: 5 }, (_, i) => input({ scheduleId: i + 1, nextRunDate: day(-1) }))
    const cut = buildRecurringDueQueue(many, NOW, 3)
    expect(cut.rows).toHaveLength(3)
    expect(cut.truncated).toBe(true)
    expect(cut.totalSchedules).toBe(5)
  })

  it("payload tanpa template/nominal/createdBy", () => {
    const queue = buildRecurringDueQueue([input()], NOW)
    const keys = Object.keys(queue.rows[0])
    expect(keys).not.toContain("template")
    expect(keys).not.toContain("createdBy")
    expect(keys).not.toContain("amount")
  })
})

describe("getRecurringDueQueue (loader fail-closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.recurringFindMany.mockResolvedValue([])
  })

  it("AC-RCQ103-B5: tanpa izin menolak sebelum query", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getRecurringDueQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("manage_recurring_transactions")
    expect(mocks.recurringFindMany).not.toHaveBeenCalled()
  })

  it("select daftar-putih tanpa template/createdBy", async () => {
    await getRecurringDueQueue({ now: NOW })
    const arg = mocks.recurringFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ isActive: true, deletedAt: null })
    const keys = Object.keys(arg.select)
    expect(keys).not.toContain("template")
    expect(keys).not.toContain("createdBy")
  })
})

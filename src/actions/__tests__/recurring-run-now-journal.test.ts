import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * "Jalankan sekarang" (runRecurringNow) must follow the same GL rules as the cron
 * path: reference the schedule it came from, and never write a journal dated inside a
 * closed period. The action used to create a bare DRAFT journal with no reference and
 * no period check, so the manual path silently produced untraceable documents.
 */

const mocks = vi.hoisted(() => {
  const requirePermission = vi.fn()
  const logActivity = vi.fn()
  const revalidatePath = vi.fn()
  const generateDocumentNumber = vi.fn()
  const nextSlug = vi.fn()
  const scheduleFindUnique = vi.fn()
  const scheduleUpdate = vi.fn()
  const scheduleUpdateMany = vi.fn()
  const journalFindFirst = vi.fn()
  const journalCreate = vi.fn()
  const expenseCreate = vi.fn()
  const settingsFindFirst = vi.fn()
  const accountFindMany = vi.fn()

  const prisma: Record<string, unknown> = {
    recurringTransaction: {
      findUniqueOrThrow: scheduleFindUnique,
      update: scheduleUpdate,
      updateMany: scheduleUpdateMany,
    },
    journal: { findFirst: journalFindFirst, create: journalCreate },
    expense: { create: expenseCreate },
    account: { findMany: accountFindMany },
    systemSetting: { findFirst: settingsFindFirst },
  }
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
  // tx period-lock baca tx.$queryRaw rows; hormati periodLockDate dari settingsFindFirst.
  prisma.$queryRaw = vi.fn(async () => {
    const s = await settingsFindFirst()
    return [{ id: 1, period_lock_date: s?.periodLockDate ?? null }]
  })

  return {
    requirePermission,
    logActivity,
    revalidatePath,
    generateDocumentNumber,
    nextSlug,
    scheduleFindUnique,
    scheduleUpdate,
    scheduleUpdateMany,
    journalFindFirst,
    journalCreate,
    expenseCreate,
    settingsFindFirst,
    accountFindMany,
    prisma,
  }
})

vi.mock("@/lib/db/prisma", async () => (await import("./validation-mock-helpers")).prismaFactory(mocks))
vi.mock("@/lib/auth/permissions", async () => (await import("./validation-mock-helpers")).permissionFactory(mocks))
vi.mock("@/lib/services/activity-log.service", async () => (await import("./validation-mock-helpers")).activityLogFactory(mocks))
vi.mock("next/cache", async () => (await import("./validation-mock-helpers")).revalidateFactory(mocks))
vi.mock("@/lib/utils/document-number", async () => (await import("./validation-mock-helpers")).docNumberFactory(mocks))
vi.mock("@/lib/utils/slug-db", async () => (await import("./validation-mock-helpers")).slugMockFactory(mocks))

import { runRecurringNow } from "../recurring.actions"

const schedule = {
  id: 42,
  isActive: true,
  deletedAt: null,
  name: "Sewa gudang",
  type: "journal",
  frequency: "monthly",
  interval: 1,
  startDate: new Date(2020, 0, 15),
  endDate: null,
  // Past date keeps `runDate` deterministic instead of "now".
  nextRunDate: new Date(2020, 0, 15),
  createdBy: 7,
  template: JSON.stringify({
    description: "Sewa gudang Januari",
    lines: [
      { accountId: 610, debit: 900000, credit: 0 },
      { accountId: 110, debit: 0, credit: 900000 },
    ],
  }),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 1 })
  mocks.settingsFindFirst.mockResolvedValue({ periodLockDate: null })
  mocks.scheduleFindUnique.mockResolvedValue(schedule)
  mocks.scheduleUpdate.mockResolvedValue({})
  mocks.scheduleUpdateMany.mockResolvedValue({ count: 1 })
  mocks.journalFindFirst.mockResolvedValue(null)
  mocks.journalCreate.mockResolvedValue({ id: 9, journalNumber: "JRN-202001-00001" })
  // Gerbang akun hidup putaran 51: default semua akun template hidup.
  mocks.accountFindMany.mockImplementation(async (args: any) => (args.where.id.in as number[]).map((id) => ({ id })))
  mocks.generateDocumentNumber.mockResolvedValue("JRN-202001-00001")
  mocks.nextSlug.mockResolvedValue("jrn-202001-00001")
})

describe("runRecurringNow — journal reference", () => {
  it("references the schedule on the generated journal", async () => {
    const res = await runRecurringNow(42)

    expect(res.success).toBe(true)
    expect(mocks.journalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: "RecurringTransaction_20200115",
          referenceId: 42,
          status: "DRAFT",
          totalDebit: 900000,
          totalCredit: 900000,
        }),
      }),
    )
  })

  it("refuses to generate a journal dated inside a closed period", async () => {
    mocks.settingsFindFirst.mockResolvedValue({ periodLockDate: new Date(2020, 0, 31) })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(false)
    expect(res.success === false && res.error).toMatch(/Periode akuntansi sudah ditutup/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
  })

  it("reuses the existing journal instead of tripping the unique reference pair", async () => {
    mocks.journalFindFirst.mockResolvedValue({ journalNumber: "JRN-202001-00001" })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(true)
    expect(res.success === true && res.message).toContain("sudah ada, dilewati")
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})

describe("runRecurringNow — jendela jadwal + akun hidup (putaran 51)", () => {
  it("menolak jadwal yang nextRunDate-nya melewati endDate", async () => {
    mocks.scheduleFindUnique.mockResolvedValue({ ...schedule, endDate: new Date(2019, 11, 31) })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(false)
    expect(mocks.scheduleUpdateMany).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
  })

  it("menolak jurnal template dengan akun nonaktif sebelum jurnal lahir", async () => {
    mocks.accountFindMany.mockImplementation(async (args: any) =>
      (args.where.id.in as number[]).filter((id) => id !== 110).map((id) => ({ id })))

    const res = await runRecurringNow(42)

    expect(res.success).toBe(false)
    expect(res.success === false && res.error).toMatch(/tidak aktif\/terhapus/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})

describe("runRecurringNow — expense period gate", () => {
  it("refuses to generate an expense dated inside a closed period", async () => {
    mocks.scheduleFindUnique.mockResolvedValue({
      ...schedule,
      type: "expense",
      template: JSON.stringify({ accountId: 620, paidFromAccountId: 110, amount: 500000 }),
    })
    mocks.settingsFindFirst.mockResolvedValue({ periodLockDate: new Date(2020, 0, 31) })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(false)
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
  })
})

describe("runRecurringNow — klaim atomik nextRunDate (race regresi)", () => {
  it("klaim menang (count 1) membuat expense tepat satu dan klaim terjadwal pada nextRunDate lama", async () => {
    mocks.scheduleFindUnique.mockResolvedValue({
      ...schedule,
      type: "expense",
      template: JSON.stringify({ accountId: 620, paidFromAccountId: 110, amount: 500000 }),
    })
    mocks.expenseCreate.mockResolvedValue({ id: 7 })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(true)
    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42, nextRunDate: schedule.nextRunDate, isActive: true, deletedAt: null },
        data: expect.objectContaining({ runCount: { increment: 1 } }),
      }),
    )
    expect(mocks.expenseCreate).toHaveBeenCalledTimes(1)
  })

  it("klaim terikat status hidup: jadwal dinonaktifkan/dihapus sesudah baca kalah klaim (putaran 22)", async () => {
    mocks.scheduleFindUnique.mockResolvedValue({
      ...schedule,
      type: "expense",
      template: JSON.stringify({ accountId: 620, paidFromAccountId: 110, amount: 500000 }),
    })
    mocks.scheduleUpdateMany.mockResolvedValue({ count: 0 })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(true)
    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, deletedAt: null }),
      }),
    )
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
  })

  it("klaim kalah (count 0, eksekusi lain sudah memajukan jadwal) TIDAK membuat expense kedua", async () => {
    mocks.scheduleFindUnique.mockResolvedValue({
      ...schedule,
      type: "expense",
      template: JSON.stringify({ accountId: 620, paidFromAccountId: 110, amount: 500000 }),
    })
    mocks.scheduleUpdateMany.mockResolvedValue({ count: 0 })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(true)
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
  })

  it("klaim kalah (count 0) juga menghentikan cabang journal sebelum create", async () => {
    mocks.scheduleUpdateMany.mockResolvedValue({ count: 0 })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(true)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
  })
})

describe("runRecurringNow — jadwal terhapus/nonaktif", () => {
  it("refuses a soft-deleted schedule and generates nothing", async () => {
    mocks.scheduleFindUnique.mockResolvedValue({ ...schedule, deletedAt: new Date(2026, 0, 1), isActive: false })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(false)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
  })

  it("refuses an inactive schedule and generates nothing", async () => {
    mocks.scheduleFindUnique.mockResolvedValue({ ...schedule, deletedAt: null, isActive: false })

    const res = await runRecurringNow(42)

    expect(res.success).toBe(false)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
  })
})

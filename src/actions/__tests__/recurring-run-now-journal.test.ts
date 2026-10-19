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
  const journalFindFirst = vi.fn()
  const journalCreate = vi.fn()
  const expenseCreate = vi.fn()
  const settingsFindFirst = vi.fn()

  const prisma: Record<string, unknown> = {
    recurringTransaction: {
      findUniqueOrThrow: scheduleFindUnique,
      update: scheduleUpdate,
    },
    journal: { findFirst: journalFindFirst, create: journalCreate },
    expense: { create: expenseCreate },
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
    journalFindFirst,
    journalCreate,
    expenseCreate,
    settingsFindFirst,
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
  mocks.journalFindFirst.mockResolvedValue(null)
  mocks.journalCreate.mockResolvedValue({ id: 9, journalNumber: "JRN-202001-00001" })
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

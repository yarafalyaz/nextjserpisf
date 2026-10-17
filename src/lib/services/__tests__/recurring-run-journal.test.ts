import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regression guard for the recurring-transaction GL chain.
 *
 * Before this, the cron generated journals with a NULL referenceType/referenceId and
 * no period check: nothing tied the journal back to its schedule, and a run dated in a
 * closed period produced a document that could never be posted. These tests pin the
 * reference key, the closed-period refusal, and the one-journal-per-date idempotency.
 */

const mocks = vi.hoisted(() => ({
  journalFindFirst: vi.fn(),
  journalCreate: vi.fn(),
  expenseCreate: vi.fn(),
  scheduleFindMany: vi.fn(),
  scheduleUpdate: vi.fn(),
  settingsFindFirst: vi.fn(),
  generateDocumentNumber: vi.fn(),
  nextSlug: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journal: { findFirst: mocks.journalFindFirst, create: mocks.journalCreate },
    expense: { create: mocks.expenseCreate },
    recurringTransaction: {
      findMany: mocks.scheduleFindMany,
      update: mocks.scheduleUpdate,
    },
    systemSetting: { findFirst: mocks.settingsFindFirst },
  },
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocumentNumber(...a),
}))

vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: (...a: unknown[]) => mocks.nextSlug(...a),
}))

import {
  recurringJournalLines,
  recurringJournalReference,
  runDueRecurring,
} from "../recurring.service"

const template = JSON.stringify({
  description: "Sewa kantor",
  lines: [
    { accountId: 610, debit: 1500000, credit: 0 },
    { accountId: 110, debit: 0, credit: 1500000 },
  ],
})

function journalSchedule(overrides: Record<string, unknown> = {}) {
  const runDate = new Date(2026, 9, 17) // 17 Oct 2026 (local)
  return {
    id: 5,
    name: "Sewa bulanan",
    type: "journal",
    frequency: "monthly",
    interval: 1,
    startDate: runDate,
    endDate: null,
    nextRunDate: runDate,
    createdBy: 3,
    template,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settingsFindFirst.mockResolvedValue({ periodLockDate: null })
  mocks.generateDocumentNumber.mockResolvedValue("JRN-202610-00001")
  mocks.nextSlug.mockResolvedValue("jrn-202610-00001")
  mocks.journalFindFirst.mockResolvedValue(null)
  mocks.journalCreate.mockResolvedValue({ id: 9, journalNumber: "JRN-202610-00001" })
  mocks.scheduleUpdate.mockResolvedValue({})
})

describe("recurringJournalReference", () => {
  it("encodes the document date in referenceType and the schedule id in referenceId", () => {
    expect(recurringJournalReference(5, new Date(2026, 9, 17))).toEqual({
      referenceType: "RecurringTransaction_20261017",
      referenceId: 5,
    })
  })

  it("gives a distinct (referenceType, referenceId) pair per schedule per date", () => {
    // journals is unique on (referenceType, referenceId): a repeated run must not
    // reuse the pair, and two schedules must never share one.
    const day1 = recurringJournalReference(5, new Date(2026, 9, 17))
    const day2 = recurringJournalReference(5, new Date(2026, 9, 18))
    const otherSchedule = recurringJournalReference(6, new Date(2026, 9, 17))

    expect(day1).not.toEqual(day2)
    expect(day1).not.toEqual(otherSchedule)
  })
})

describe("recurringJournalLines", () => {
  it("keeps only filled lines and reports both totals", () => {
    const parsed = JSON.parse(template)
    parsed.lines.push({ accountId: 0, debit: 0, credit: 0 })
    expect(recurringJournalLines(parsed)).toEqual(
      expect.objectContaining({ totalDebit: 1500000, totalCredit: 1500000 }),
    )
    expect(recurringJournalLines(parsed).lines).toHaveLength(2)
  })
})

describe("runDueRecurring — journal output", () => {
  it("writes the schedule reference on the generated journal", async () => {
    mocks.scheduleFindMany.mockResolvedValue([journalSchedule()])

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors).toEqual([])
    expect(mocks.journalCreate).toHaveBeenCalledTimes(1)
    expect(mocks.journalCreate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        referenceType: "RecurringTransaction_20261017",
        referenceId: 5,
        status: "DRAFT",
        totalDebit: 1500000,
        totalCredit: 1500000,
      }),
    )
  })

  it("skips (does not duplicate) a journal that already exists for that date", async () => {
    mocks.scheduleFindMany.mockResolvedValue([journalSchedule()])
    mocks.journalFindFirst.mockResolvedValue({ journalNumber: "JRN-202610-00001" })

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(result.errors).toEqual([])
    expect(result.generated[0]).toContain("sudah ada, dilewati")
  })

  it("refuses to create a journal inside a closed period and keeps the schedule due", async () => {
    mocks.scheduleFindMany.mockResolvedValue([journalSchedule()])
    mocks.settingsFindFirst.mockResolvedValue({ periodLockDate: new Date(2026, 9, 31) })

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(mocks.journalCreate).not.toHaveBeenCalled()
    expect(result.errors[0]).toMatch(/Periode akuntansi sudah ditutup/)
    // The occurrence stays due (no nextRunDate advance) so it retries after reopening.
    const lastWrite = mocks.scheduleUpdate.mock.calls.at(-1)![0]
    expect(lastWrite.data).toEqual(
      expect.objectContaining({ lastResult: expect.stringMatching(/Gagal/) }),
    )
    expect(lastWrite.data).not.toHaveProperty("nextRunDate")
  })
})

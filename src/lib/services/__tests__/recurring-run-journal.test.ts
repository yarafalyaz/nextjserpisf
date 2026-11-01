import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regression guard for the recurring-transaction GL chain.
 *
 * Before this, the cron generated journals with a NULL referenceType/referenceId and
 * no period check: nothing tied the journal back to its schedule, and a run dated in a
 * closed period produced a document that could never be posted. These tests pin the
 * reference key, the closed-period refusal, and the one-journal-per-date idempotency.
 */

const mocks = vi.hoisted(() => {
  const journalFindFirst = vi.fn()
  const journalCreate = vi.fn()
  const expenseCreate = vi.fn()
  const scheduleFindMany = vi.fn()
  const scheduleUpdate = vi.fn()
  const scheduleUpdateMany = vi.fn()
  const settingsFindFirst = vi.fn()
  const accountFindMany = vi.fn()
  const generateDocumentNumber = vi.fn()
  const nextSlug = vi.fn()

  const prisma: Record<string, unknown> = {
    journal: { findFirst: journalFindFirst, create: journalCreate },
    expense: { create: expenseCreate },
    account: { findMany: accountFindMany },
    recurringTransaction: {
      findMany: scheduleFindMany,
      update: scheduleUpdate,
      updateMany: scheduleUpdateMany,
    },
    systemSetting: { findFirst: settingsFindFirst },
  }
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
  prisma.$queryRaw = vi.fn(async () => {
    const s = await settingsFindFirst()
    return [{ id: 1, period_lock_date: s?.periodLockDate ?? null }]
  })

  return {
    journalFindFirst,
    journalCreate,
    expenseCreate,
    scheduleFindMany,
    scheduleUpdate,
    scheduleUpdateMany,
    settingsFindFirst,
    accountFindMany,
    generateDocumentNumber,
    nextSlug,
    prisma,
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))

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
  // Gerbang akun hidup putaran 51: default semua akun template hidup.
  mocks.accountFindMany.mockImplementation(async (args: any) => (args.where.id.in as number[]).map((id) => ({ id })))
  mocks.scheduleUpdate.mockResolvedValue({})
  mocks.scheduleUpdateMany.mockResolvedValue({ count: 1 })
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

function expenseSchedule(overrides: Record<string, unknown> = {}) {
  return journalSchedule({
    type: "expense",
    name: "Listrik bulanan",
    template: JSON.stringify({ accountId: 620, paidFromAccountId: 110, amount: 500000, description: "Listrik" }),
    ...overrides,
  })
}

describe("runDueRecurring — expense output", () => {
  it("refuses to create an expense inside a closed period and keeps the schedule due", async () => {
    mocks.scheduleFindMany.mockResolvedValue([expenseSchedule()])
    mocks.settingsFindFirst.mockResolvedValue({ periodLockDate: new Date(2026, 9, 31) })
    mocks.expenseCreate.mockResolvedValue({ id: 7 })

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(mocks.expenseCreate).not.toHaveBeenCalled()
    expect(result.errors[0]).toMatch(/Periode akuntansi sudah ditutup/)
    // Bookkeeping gagal kini updateMany terikat klaim, bukan update polos.
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
    const lastWrite = mocks.scheduleUpdateMany.mock.calls.at(-1)![0]
    expect(lastWrite.where).toEqual({ id: 5, nextRunDate: new Date(2026, 9, 17) })
    expect(lastWrite.data).not.toHaveProperty("nextRunDate")
  })

  it("creates the expense when the period is open", async () => {
    mocks.scheduleFindMany.mockResolvedValue([expenseSchedule()])
    mocks.expenseCreate.mockResolvedValue({ id: 7 })

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors).toEqual([])
    expect(mocks.expenseCreate).toHaveBeenCalledTimes(1)
  })
})

describe("runDueRecurring — akun template hidup (putaran 51)", () => {
  it("menolak jurnal kron dengan akun nonaktif sebelum jurnal lahir", async () => {
    mocks.scheduleFindMany.mockResolvedValue([journalSchedule()])
    mocks.accountFindMany.mockImplementation(async (args: any) =>
      (args.where.id.in as number[]).filter((id) => id !== 110).map((id) => ({ id })))

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors[0]).toMatch(/tidak aktif\/terhapus/)
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })

  it("menolak expense kron dengan akun asal nonaktif sebelum expense lahir", async () => {
    mocks.scheduleFindMany.mockResolvedValue([expenseSchedule()])
    mocks.accountFindMany.mockImplementation(async (args: any) =>
      (args.where.id.in as number[]).filter((id) => id !== 110).map((id) => ({ id })))

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors[0]).toMatch(/tidak aktif\/terhapus/)
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
  })
})

describe("runDueRecurring — klaim atomik nextRunDate (race regresi)", () => {
  it("klaim kalah (count 0) TIDAK membuat expense kedua dan tidak dicatat sebagai generated/error", async () => {
    mocks.scheduleFindMany.mockResolvedValue([expenseSchedule()])
    mocks.scheduleUpdateMany.mockResolvedValue({ count: 0 })
    mocks.expenseCreate.mockResolvedValue({ id: 7 })

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, nextRunDate: new Date(2026, 9, 17), isActive: true, deletedAt: null },
      }),
    )
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
    expect(result.generated).toEqual([])
    expect(result.errors).toEqual([])
  })

  it("klaim menang (count 1) membuat expense tepat satu", async () => {
    mocks.scheduleFindMany.mockResolvedValue([expenseSchedule()])
    mocks.expenseCreate.mockResolvedValue({ id: 7 })

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors).toEqual([])
    expect(mocks.expenseCreate).toHaveBeenCalledTimes(1)
    expect(result.generated).toHaveLength(1)
  })

  it("klaim terikat isActive + deletedAt: jadwal dinonaktifkan/dihapus sesudah scan kalah klaim", async () => {
    // Scan membaca isActive/deletedAt sekali di luar tx; hapus/nonaktifkan
    // konkuren sesudah scan tidak memajukan nextRunDate, jadi syarat klaim lama
    // {id, nextRunDate} tetap cocok dan dokumen lahir untuk jadwal mati.
    mocks.scheduleFindMany.mockResolvedValue([expenseSchedule()])
    mocks.scheduleUpdateMany.mockResolvedValue({ count: 0 })
    mocks.expenseCreate.mockResolvedValue({ id: 7 })

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, nextRunDate: new Date(2026, 9, 17), isActive: true, deletedAt: null },
      }),
    )
    expect(mocks.expenseCreate).not.toHaveBeenCalled()
    expect(result.generated).toEqual([])
    expect(result.errors).toEqual([])
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
    // Penulisan lastResult gagal terikat klaim {id, nextRunDate: runDate} —
    // BUKAN update polos (lihat describe klaim bookkeeping di bawah).
    const lastWrite = mocks.scheduleUpdateMany.mock.calls.at(-1)![0]
    expect(lastWrite.where).toEqual({ id: 5, nextRunDate: new Date(2026, 9, 17) })
    expect(lastWrite.data).toEqual(
      expect.objectContaining({ lastResult: expect.stringMatching(/Gagal/) }),
    )
    expect(lastWrite.data).not.toHaveProperty("nextRunDate")
  })
})

describe("runDueRecurring — cek periode lewat kunci baris settings (race regresi)", () => {
  // Lawan: closeAccountingPeriod mengunci system_settings FOR UPDATE lalu set
  // periodLockDate. Cek periode cron WAJIB mengambil kunci yang sama lewat tx
  // klaimnya; bacaan findFirst tanpa kunci bisa commit sebelum penutupan lalu
  // draft lahir di periode yang baru ditutup (jadwal pun sudah maju).
  function lockedSql(): string {
    const prismaMock = mocks.prisma as unknown as { $queryRaw: ReturnType<typeof vi.fn> }
    return prismaMock.$queryRaw.mock.calls
      .map((call: unknown[]) => {
        const arg = call[0] as { sql?: string; strings?: string[] } | string[]
        if (Array.isArray(arg)) return arg.join("?")
        return arg?.sql ?? arg?.strings?.join("?") ?? ""
      })
      .join("\n")
  }

  it("jalur journal menilai periode lewat $queryRaw FOR UPDATE di tx klaim", async () => {
    mocks.scheduleFindMany.mockResolvedValue([journalSchedule()])

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors).toEqual([])
    expect(lockedSql()).toMatch(/system_settings[\s\S]*FOR UPDATE/)
  })

  it("jalur expense menilai periode lewat $queryRaw FOR UPDATE di tx klaim", async () => {
    mocks.scheduleFindMany.mockResolvedValue([expenseSchedule()])

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors).toEqual([])
    expect(lockedSql()).toMatch(/system_settings[\s\S]*FOR UPDATE/)
  })
})

describe("runDueRecurring — bookkeeping terikat klaim (race regresi)", () => {
  it("lastResult gagal TIDAK menimpa pemenang: penulisan gagal terikat {id, nextRunDate}", async () => {
    // Pemenang sudah memajukan nextRunDate; run kalah yang gagal membuat
    // jurnal tak boleh menimpa lastResult sukses pemenang. Dengan syarat
    // klaim yang sama, updateMany kalah mengembalikan count 0 di DB nyata.
    mocks.scheduleFindMany.mockResolvedValue([journalSchedule()])
    mocks.settingsFindFirst.mockResolvedValue({ periodLockDate: new Date(2026, 9, 31) })
    // Panggilan pertama = klaim utama dalam tx (menang), berikutnya = tulis
    // lastResult gagal yang kini terikat klaim (kalah -> count 0, diabaikan).
    mocks.scheduleUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 })

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors[0]).toMatch(/Periode akuntansi sudah ditutup/)
    // Update polos tidak pernah dipakai untuk bookkeeping.
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
    const failureWrite = mocks.scheduleUpdateMany.mock.calls.at(-1)![0]
    expect(failureWrite.where).toEqual({ id: 5, nextRunDate: new Date(2026, 9, 17) })
    expect(failureWrite.data.lastResult).toMatch(/Gagal/)
  })

  it("template tidak valid: lastResult ditulis lewat updateMany terikat klaim, bukan update polos", async () => {
    mocks.scheduleFindMany.mockResolvedValue([
      journalSchedule({
        template: JSON.stringify({ description: "Rusak", lines: [] }),
      }),
    ])

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.errors[0]).toMatch(/minimal 2 baris/)
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, nextRunDate: new Date(2026, 9, 17) },
      data: { lastResult: expect.stringMatching(/Gagal: Jurnal berulang butuh minimal 2 baris/) },
    })
  })

  it("retire melewati tanggal akhir terikat {id, isActive: true}, bukan update polos", async () => {
    const start = new Date(2026, 0, 1)
    mocks.scheduleFindMany.mockResolvedValue([
      journalSchedule({
        startDate: start,
        endDate: new Date(2026, 5, 30),
        nextRunDate: new Date(2026, 9, 17),
      }),
    ])

    const result = await runDueRecurring(new Date(2026, 9, 17), 1)

    expect(result.generated).toEqual([])
    expect(result.errors).toEqual([])
    expect(mocks.scheduleUpdate).not.toHaveBeenCalled()
    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, isActive: true },
      data: { isActive: false, lastResult: "Berakhir (melewati tanggal akhir)" },
    })
    expect(mocks.journalCreate).not.toHaveBeenCalled()
  })
})

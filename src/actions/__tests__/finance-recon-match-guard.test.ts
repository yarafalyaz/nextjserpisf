import { describe, it, expect, vi, beforeEach } from "vitest"

import {
  bankLineReadFixture,
  bankStatementLineForm,
  matchEntryFixture,
  matchLineFixture,
  type FinanceGuardHolder,
  recordReconLockOrder,
  resetFinanceGuardMocks,
  seedReconItems,
  wireMatchOk,
  financeAccountingHookFactory,
  financeActivityLogFactory,
  financeApprovalFactory,
  financeDocumentNumberFactory,
  financeExpenseHookFactory,
  financeNextCacheFactory,
  financePeriodLockFactory,
  financePermissionsFactory,
  financePrismaFactory,
  financeSettingsFactory,
  financeSlugFactory,
} from "./finance-lock-fixtures"

// Guard R-03 (matchReconciliationLine: nominal + arah + reuse jurnal) dan
// R-04 (update/delete line kunci induk FOR UPDATE sebelum cek completedMatch).
// Mock prisma penuh: transaksi = panggil cb dengan prismaMock, jadi urutan
// $executeRaw vs findFirst bisa dijaga lewat rekaman panggilan.

// vi.hoisted tidak bisa memanggil helper yang diimpor (TDZ impor), jadi
// mock Prisma dibuat async di dalam factory vi.mock lalu disimpan di sini.
const mocks: FinanceGuardHolder = vi.hoisted(() => ({ guards: null as any, models: ["bankStatement", "bankStatementLine", "bankReconciliation", "bankReconciliationItem", "journal", "journalEntry"] }))
vi.mock("@/lib/db/prisma", () => financePrismaFactory(mocks))
vi.mock("@/lib/auth/permissions", () => financePermissionsFactory(mocks))
vi.mock("next/cache", () => financeNextCacheFactory(mocks))
vi.mock("@/lib/services/activity-log.service", () => financeActivityLogFactory(mocks))
vi.mock("@/lib/services/period-lock.service", () => financePeriodLockFactory(mocks))
vi.mock("@/lib/utils/document-number", () => financeDocumentNumberFactory())
vi.mock("@/lib/utils/slug-db", () => financeSlugFactory())
vi.mock("@/lib/services/approval-workflow.service", () => financeApprovalFactory())
vi.mock("@/lib/hooks/accounting.hook", () => financeAccountingHookFactory())
vi.mock("@/lib/hooks/expense.hook", () => financeExpenseHookFactory())
vi.mock("@/lib/utils/settings", () => financeSettingsFactory())

import {
  matchReconciliationLine,
  updateBankStatementLine,
  deleteBankStatementLine,
} from "../finance.actions"

const baseLine = matchLineFixture()
const baseEntry = matchEntryFixture()

beforeEach(() => {
  vi.clearAllMocks()
  resetFinanceGuardMocks(mocks.guards)
})

describe("R-03 matchReconciliationLine guards", () => {
  it("tolak nominal beda (1000 vs 500)", async () => {
    wireMatchOk(mocks.guards.prismaMock, baseLine, { ...baseEntry, debit: 500, credit: 0 })
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Nominal tidak sama")
    expect(mocks.guards.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
    expect(mocks.guards.prismaMock.bankReconciliationItem.update).not.toHaveBeenCalled()
  })

  it("toleransi 0.01: beda 0.005 lolos, beda 0.01 ditolak", async () => {
    wireMatchOk(mocks.guards.prismaMock, baseLine, { ...baseEntry, debit: 1000.005, credit: 0 })
    const ok = await matchReconciliationLine(9, 11, 77)
    expect(ok.success).toBe(true)

    vi.clearAllMocks()
    mocks.guards.requirePermissionMock.mockResolvedValue({ id: 1 })
    wireMatchOk(mocks.guards.prismaMock, baseLine, { ...baseEntry, debit: 1000.01, credit: 0 })
    const bad = await matchReconciliationLine(9, 11, 77)
    expect(bad.success).toBe(false)
    expect(String(bad.error)).toContain("Nominal tidak sama")
  })

  it("tolak arah beda: baris debit vs entri kredit", async () => {
    wireMatchOk(
      mocks.guards.prismaMock,
      { ...baseLine, type: "debit", debit: 1000, credit: 0 },
      { ...baseEntry, debit: 0, credit: 1000 },
    )
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Arah tidak sama")
    expect(mocks.guards.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("tolak arah beda: baris kredit vs entri debit", async () => {
    wireMatchOk(
      mocks.guards.prismaMock,
      { ...baseLine, type: "credit", debit: 0, credit: 1000 },
      { ...baseEntry, debit: 1000, credit: 0 },
    )
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Arah tidak sama")
  })

  it("tolak journalEntryId yang sudah dipakai baris lain di rekonsiliasi sama", async () => {
    wireMatchOk(mocks.guards.prismaMock, baseLine, baseEntry)
    mocks.guards.prismaMock.bankReconciliationItem.findFirst.mockImplementation(
      async (args: any) => {
        // panggilan pertama = reuse-check → ada pemakai lain
        if (args?.where?.journalEntryId === 77) return { id: 55 }
        return null
      },
    )
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("sudah dipakai")
    expect(mocks.guards.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("match ulang pasangan yang sama tetap idempoten (reuse-check kecualikan baris sendiri)", async () => {
    wireMatchOk(mocks.guards.prismaMock, baseLine, baseEntry)
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(true)
    const reuseWhere = mocks.guards.prismaMock.bankReconciliationItem.findFirst.mock.calls[0][0].where
    expect(reuseWhere).toMatchObject({
      bankReconciliationId: 9,
      journalEntryId: 77,
      NOT: { bankStatementLineId: 11 },
    })
  })

  it("P2002 dari UNIQUE dipetakan ke pesan reuse, bukan error mentah", async () => {
    wireMatchOk(mocks.guards.prismaMock, baseLine, baseEntry)
    const p2002 = Object.assign(new Error("Unique constraint"), { code: "P2002" })
    mocks.guards.prismaMock.bankReconciliationItem.create.mockRejectedValueOnce(p2002)
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("sudah dipakai")
    spy.mockRestore()
  })
})

describe("R-04 parent lock sebelum cek completedMatch", () => {
  function wireLineGuards() {
    mocks.guards.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue(
      bankLineReadFixture(),
    )
    mocks.guards.prismaMock.bankStatementLine.findUnique.mockResolvedValue(
      bankLineReadFixture(),
    )
  }

  it("update: kunci BARIS jalan sebelum baca ulang + cek completedMatch", async () => {
    wireLineGuards()
    seedReconItems(mocks.guards.prismaMock)
    const order: string[] = []
    // $executeRaw di mock level prisma — transaksi meneruskan prismaMock yang
    // sama, jadi bungkus untuk rekam urutan vs findFirst completedMatch.
    // Baris (bank_statement_lines) harus dikunci SEBELUM baca ulang line
    // (findUniqueOrThrow) dan sebelum lock induk + cek completedMatch —
    // kalau tidak match bersamaan bisa selip di antara baca dan tulis.
    recordReconLockOrder(
      mocks.guards.prismaMock,
      order,
      mocks.guards.prismaMock.bankStatementLine.findUniqueOrThrow,
      true,
    )

    await updateBankStatementLine(11, bankStatementLineForm())
    // R-12 menyisipkan lock-header di antara reread-line dan lock-parent:
    // urutan global baris -> header(s) -> rekonsiliasi.
    expect(order).toEqual(["lock-line", "reread-line", "lock-header", "lock-parent", "check"])
  })

  it("delete: kunci BARIS jalan sebelum baca ulang + cek completedMatch", async () => {
    wireLineGuards()
    seedReconItems(mocks.guards.prismaMock)
    const order: string[] = []
    recordReconLockOrder(
      mocks.guards.prismaMock,
      order,
      mocks.guards.prismaMock.bankStatementLine.findUnique,
      true,
    )

    await deleteBankStatementLine(11)
    // R-12: lock-header di antara reread-line dan lock-parent (baris ->
    // header -> rekonsiliasi).
    expect(order).toEqual(["lock-line", "reread-line", "lock-header", "lock-parent", "check"])
  })

  it("match: kunci BARIS sebelum induk, hubungan dibaca ulang sesudah lock", async () => {
    wireMatchOk(mocks.guards.prismaMock, baseLine, baseEntry)
    const order: string[] = []
    recordReconLockOrder(
      mocks.guards.prismaMock,
      order,
      mocks.guards.prismaMock.bankStatementLine.findUniqueOrThrow,
    )

    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(true)
    expect(order).toEqual(["lock-line", "lock-parent", "reread-line"])
  })

  it("updateJournal: tanggal BARU tak-terparse ditolak berisik (bukan Invalid Date)", async () => {
    const { updateJournal } = await import("../finance.actions")
    mocks.guards.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({
      id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"), journalNumber: "JRN-1", type: "GENERAL",
    })
    const f = new FormData()
    f.append("transactionDate", "bukan-tanggal")
    f.append("description", "x")
    f.append("entries", JSON.stringify([
      { accountId: 1, debit: 100, credit: 0, memo: "" },
      { accountId: 2, debit: 0, credit: 100, memo: "" },
    ]))
    const res = await updateJournal(7, f)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Tanggal tidak valid")
    // Gagal SEBELUM tulis: tidak ada transaksi = tidak ada lock, tidak ada update.
    expect(mocks.guards.prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("cek completedMatch tetap memblokir baris rekonsiliasi selesai", async () => {
    wireLineGuards()
    seedReconItems(mocks.guards.prismaMock)
    mocks.guards.prismaMock.bankReconciliationItem.findFirst.mockResolvedValue({ id: 55 })
    const res = await updateBankStatementLine(11, bankStatementLineForm())
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("rekonsiliasi selesai")
  })
})

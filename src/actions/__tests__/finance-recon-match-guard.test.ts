import { describe, it, expect, vi, beforeEach } from "vitest"

// Guard R-03 (matchReconciliationLine: nominal + arah + reuse jurnal) dan
// R-04 (update/delete line kunci induk FOR UPDATE sebelum cek completedMatch).
// Mock prisma penuh: transaksi = panggil cb dengan prismaMock, jadi urutan
// $executeRaw vs findFirst bisa dijaga lewat rekaman panggilan.

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })
  const prismaMock: any = {
    bankStatement: buildModelMock(),
    bankStatementLine: buildModelMock(),
    journalEntry: buildModelMock(),
    bankReconciliation: buildModelMock(),
    bankReconciliationItem: buildModelMock(),
    journal: buildModelMock(),
    journalEntry: buildModelMock(),
    $transaction: vi.fn(async (cb: any) =>
      typeof cb === "function" ? cb(prismaMock) : Promise.all(cb),
    ),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }
  return {
    requirePermissionMock: vi.fn(),
    assertPeriodOpenMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: any) => mocks.requirePermissionMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivityMock,
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: any) => mocks.assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn(async () => "DOC-001"),
}))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "s") }))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn(),
  assertApproved: vi.fn(),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onExpenseApproved: vi.fn(),
  onPettyCashCreated: vi.fn(),
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: vi.fn(),
}))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn(async () => ({})),
}))

import {
  matchReconciliationLine,
  updateBankStatementLine,
  deleteBankStatementLine,
} from "../finance.actions"

function fdMap(payload: Record<string, string | number>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, String(v))
  return f
}

function wireMatchOk(line: any, entry: any) {
  mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
    status: "draft",
    accountId: 10,
    periodStart: null,
    periodEnd: null,
  })
  mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue(line)
  mocks.prismaMock.journalEntry.findUniqueOrThrow.mockResolvedValue(entry)
  // reuse-check default: tidak dipakai
  mocks.prismaMock.bankReconciliationItem.findFirst.mockResolvedValue(null)
}

const baseLine = {
  date: new Date("2026-06-01"),
  amount: 1000,
  type: "debit",
  debit: 1000,
  credit: 0,
  bankStatement: { accountId: 10 },
}
const baseEntry = {
  accountId: 10,
  debit: 1000,
  credit: 0,
  journal: { status: "POSTED", deletedAt: null, transactionDate: new Date("2026-06-02") },
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const m of Object.values(mocks.prismaMock) as any[]) {
    if (!m || typeof m !== "object" || !m.findFirst) continue
    m.findFirst.mockReset().mockResolvedValue(null)
    m.findUnique.mockReset().mockResolvedValue(null)
    m.findUniqueOrThrow.mockReset().mockResolvedValue(null)
    m.findMany.mockReset().mockResolvedValue([])
    m.create.mockReset().mockResolvedValue({ id: 1 })
    m.update.mockReset().mockResolvedValue({})
    m.delete.mockReset().mockResolvedValue({})
    m.aggregate.mockReset().mockResolvedValue({ _sum: {} })
  }
  mocks.prismaMock.$transaction
    .mockReset()
    .mockImplementation(async (cb: any) =>
      typeof cb === "function" ? cb(mocks.prismaMock) : Promise.all(cb),
    )
  mocks.prismaMock.$executeRaw.mockReset().mockResolvedValue(0)
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.assertPeriodOpenMock.mockResolvedValue({})
})

describe("R-03 matchReconciliationLine guards", () => {
  it("tolak nominal beda (1000 vs 500)", async () => {
    wireMatchOk(baseLine, { ...baseEntry, debit: 500, credit: 0 })
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Nominal tidak sama")
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.bankReconciliationItem.update).not.toHaveBeenCalled()
  })

  it("toleransi 0.01: beda 0.005 lolos, beda 0.01 ditolak", async () => {
    wireMatchOk(baseLine, { ...baseEntry, debit: 1000.005, credit: 0 })
    const ok = await matchReconciliationLine(9, 11, 77)
    expect(ok.success).toBe(true)

    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    wireMatchOk(baseLine, { ...baseEntry, debit: 1000.01, credit: 0 })
    const bad = await matchReconciliationLine(9, 11, 77)
    expect(bad.success).toBe(false)
    expect(String(bad.error)).toContain("Nominal tidak sama")
  })

  it("tolak arah beda: baris debit vs entri kredit", async () => {
    wireMatchOk(
      { ...baseLine, type: "debit", debit: 1000, credit: 0 },
      { ...baseEntry, debit: 0, credit: 1000 },
    )
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Arah tidak sama")
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("tolak arah beda: baris kredit vs entri debit", async () => {
    wireMatchOk(
      { ...baseLine, type: "credit", debit: 0, credit: 1000 },
      { ...baseEntry, debit: 1000, credit: 0 },
    )
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Arah tidak sama")
  })

  it("tolak journalEntryId yang sudah dipakai baris lain di rekonsiliasi sama", async () => {
    wireMatchOk(baseLine, baseEntry)
    mocks.prismaMock.bankReconciliationItem.findFirst.mockImplementation(
      async (args: any) => {
        // panggilan pertama = reuse-check → ada pemakai lain
        if (args?.where?.journalEntryId === 77) return { id: 55 }
        return null
      },
    )
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("sudah dipakai")
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("match ulang pasangan yang sama tetap idempoten (reuse-check kecualikan baris sendiri)", async () => {
    wireMatchOk(baseLine, baseEntry)
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(true)
    const reuseWhere = mocks.prismaMock.bankReconciliationItem.findFirst.mock.calls[0][0].where
    expect(reuseWhere).toMatchObject({
      bankReconciliationId: 9,
      journalEntryId: 77,
      NOT: { bankStatementLineId: 11 },
    })
  })

  it("P2002 dari UNIQUE dipetakan ke pesan reuse, bukan error mentah", async () => {
    wireMatchOk(baseLine, baseEntry)
    const p2002 = Object.assign(new Error("Unique constraint"), { code: "P2002" })
    mocks.prismaMock.bankReconciliationItem.create.mockRejectedValueOnce(p2002)
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("sudah dipakai")
    spy.mockRestore()
  })
})

describe("R-04 parent lock sebelum cek completedMatch", () => {
  function wireLineGuards() {
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })
    mocks.prismaMock.bankStatementLine.findUnique.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })
  }

  it("update: kunci BARIS jalan sebelum baca ulang + cek completedMatch", async () => {
    wireLineGuards()
    mocks.prismaMock.bankReconciliationItem.findMany.mockResolvedValue([
      { bankReconciliationId: 9 },
    ])
    const order: string[] = []
    const txExec = mocks.prismaMock.$executeRaw
    // $executeRaw di mock level prisma — transaksi meneruskan prismaMock yang
    // sama, jadi bungkus untuk rekam urutan vs findFirst completedMatch.
    // Baris (bank_statement_lines) harus dikunci SEBELUM baca ulang line
    // (findUniqueOrThrow) dan sebelum lock induk + cek completedMatch —
    // kalau tidak match bersamaan bisa selip di antara baca dan tulis.
    const origExec = txExec.getMockImplementation()
    txExec.mockImplementation(async (...a: any[]) => {
      const sql = String(a[0]?.[0] ?? a[0] ?? "")
      order.push(sql.includes("bank_statement_lines") ? "lock-line" : "lock-parent")
      return origExec ? origExec(...a) : 0
    })
    const lineRead = mocks.prismaMock.bankStatementLine.findUniqueOrThrow
    const origRead = lineRead.getMockImplementation()
    lineRead.mockImplementation(async (...a: any[]) => {
      order.push("reread-line")
      return origRead ? origRead(...a) : null
    })
    const itemFindFirst = mocks.prismaMock.bankReconciliationItem.findFirst
    itemFindFirst.mockImplementation(async () => {
      order.push("check")
      return null
    })

    await updateBankStatementLine(
      11,
      fdMap({ bankStatementId: 3, date: "2026-07-01", amount: "900", type: "credit" }),
    )
    expect(order).toEqual(["lock-line", "reread-line", "lock-parent", "check"])
  })

  it("delete: kunci BARIS jalan sebelum baca ulang + cek completedMatch", async () => {
    wireLineGuards()
    mocks.prismaMock.bankReconciliationItem.findMany.mockResolvedValue([
      { bankReconciliationId: 9 },
    ])
    const order: string[] = []
    const txExec = mocks.prismaMock.$executeRaw
    const origExec = txExec.getMockImplementation()
    txExec.mockImplementation(async (...a: any[]) => {
      const sql = String(a[0]?.[0] ?? a[0] ?? "")
      order.push(sql.includes("bank_statement_lines") ? "lock-line" : "lock-parent")
      return origExec ? origExec(...a) : 0
    })
    const lineRead = mocks.prismaMock.bankStatementLine.findUnique
    const origRead = lineRead.getMockImplementation()
    lineRead.mockImplementation(async (...a: any[]) => {
      order.push("reread-line")
      return origRead
        ? origRead(...a)
        : { id: 11, bankStatementId: 3, date: new Date("2026-06-01") }
    })
    mocks.prismaMock.bankReconciliationItem.findFirst.mockImplementation(async () => {
      order.push("check")
      return null
    })

    await deleteBankStatementLine(11)
    expect(order).toEqual(["lock-line", "reread-line", "lock-parent", "check"])
  })

  it("match: kunci BARIS sebelum induk, hubungan dibaca ulang sesudah lock", async () => {
    wireMatchOk(baseLine, baseEntry)
    const order: string[] = []
    const txExec = mocks.prismaMock.$executeRaw
    const origExec = txExec.getMockImplementation()
    txExec.mockImplementation(async (...a: any[]) => {
      const sql = String(a[0]?.[0] ?? a[0] ?? "")
      order.push(sql.includes("bank_statement_lines") ? "lock-line" : "lock-parent")
      return origExec ? origExec(...a) : 0
    })
    const lineRead = mocks.prismaMock.bankStatementLine.findUniqueOrThrow
    const origRead = lineRead.getMockImplementation()
    lineRead.mockImplementation(async (...a: any[]) => {
      order.push("reread-line")
      return origRead ? origRead(...a) : null
    })

    const res = await matchReconciliationLine(9, 11, 77)
    expect(res.success).toBe(true)
    expect(order).toEqual(["lock-line", "lock-parent", "reread-line"])
  })

  it("updateJournal: tanggal BARU tak-terparse ditolak berisik (bukan Invalid Date)", async () => {
    const { updateJournal } = await import("../finance.actions")
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({
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
    expect(String(res.error)).toContain("Tanggal transaksi tidak valid")
    // Gagal SEBELUM tulis: tidak ada transaksi = tidak ada lock, tidak ada update.
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("cek completedMatch tetap memblokir baris rekonsiliasi selesai", async () => {
    wireLineGuards()
    mocks.prismaMock.bankReconciliationItem.findMany.mockResolvedValue([
      { bankReconciliationId: 9 },
    ])
    mocks.prismaMock.bankReconciliationItem.findFirst.mockResolvedValue({ id: 55 })
    const res = await updateBankStatementLine(
      11,
      fdMap({ bankStatementId: 3, date: "2026-07-01", amount: "900", type: "credit" }),
    )
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("rekonsiliasi selesai")
  })
})

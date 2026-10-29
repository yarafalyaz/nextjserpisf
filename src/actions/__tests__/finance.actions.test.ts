import { findFirstNegativeBalance, computePettyCashChain } from "@/lib/finance/petty-cash-chain"
import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })

  const prismaMock: any = {
    bankStatement: buildModelMock(),
    bankStatementLine: buildModelMock(),
    journal: buildModelMock(),
    journalEntry: buildModelMock(),
    expense: buildModelMock(),
    payroll: buildModelMock(),
    materialIssue: buildModelMock(),
    project: buildModelMock(),
    pettyCash: buildModelMock(),
    bankReconciliation: buildModelMock(),
    bankReconciliationLine: buildModelMock(),
    costCenter: buildModelMock(),
    profitCenter: buildModelMock(),
    account: buildModelMock(),
    accountingPeriod: buildModelMock(),
    transactionAttachment: buildModelMock(),
    bankReconciliationItem: buildModelMock(),
    user: buildModelMock(),
    paymentMethod: buildModelMock(),
    approvalWorkflow: buildModelMock(),
    approval: buildModelMock(),
    
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
    assertPeriodOpenMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    generateDocNumMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: mocks.generateDocNumMock }))
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: () => Promise.resolve(42) },
}));
vi.mock("@/lib/finance/pettycash-posting", () => ({
  postPettyCashToGL: vi.fn().mockResolvedValue({}),
  reversePettyCashFromGL: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onExpenseApproved: vi.fn().mockResolvedValue({}),
  onPettyCashCreated: vi.fn().mockResolvedValue({}),
  reverseJournalsByReferenceTx: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/finance/petty-cash-chain", () => ({
  computePettyCashChain: vi.fn().mockReturnValue([]),
  findFirstNegativeBalance: vi.fn().mockReturnValue(null),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: any) => mocks.assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue({}),
  assertApproved: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: vi.fn(async () => ({
    pettyCashAccountId: 1,
    cashBankAccountId: 2,
    generalExpenseAccountId: 3,
  })),
}))

import * as actions from "../finance.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  
  // Reset model mocks and transaction
  Object.values(mocks.prismaMock).forEach((m: any) => {
    if (typeof m === "function") return
    if (m && typeof m === "object" && typeof m.findFirst === "function") {
      m.findFirst.mockReset().mockResolvedValue(null)
      m.findUnique.mockReset().mockResolvedValue(null)
      m.findUniqueOrThrow.mockReset().mockResolvedValue(null)
      m.findMany.mockReset().mockResolvedValue([])
      m.create.mockReset().mockResolvedValue({ id: 1 })
      m.createMany.mockReset().mockResolvedValue({ count: 1 })
      m.update.mockReset().mockResolvedValue({})
      m.updateMany.mockReset().mockResolvedValue({ count: 1 })
      m.delete.mockReset().mockResolvedValue({})
      m.deleteMany.mockReset().mockResolvedValue({ count: 1 })
      m.count.mockReset().mockResolvedValue(0)
      m.upsert.mockReset().mockResolvedValue({})
      m.aggregate.mockReset().mockResolvedValue({ _sum: {} })
    }
  })
  
  mocks.prismaMock.$transaction.mockReset().mockImplementation(async (ops: any) => {
    if (typeof ops === "function") return ops(mocks.prismaMock)
    return Promise.all(ops)
  })

  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.assertPeriodOpenMock.mockReset().mockResolvedValue({})
  mocks.generateDocNumMock.mockResolvedValue("DOC-001")
  vi.mocked(findFirstNegativeBalance).mockReset().mockReturnValue(null)
  vi.mocked(computePettyCashChain).mockReset().mockReturnValue([])
  mocks.prismaMock.journalEntry.findMany.mockResolvedValue([{ debit: 9999999, credit: 0 }])
  // Guard akun bare-int: default semua account.count = ada (1); tiap tes boleh
  // override ke 0 untuk kasus akun-hilang.
  mocks.prismaMock.account.count.mockReset().mockResolvedValue(1)
})

describe("Bank Statement Actions", () => {
  it("createBankStatement succeeds", async () => {
    const res = await (actions as any).createBankStatement(fdMap({
      accountId: 1,
      date: "2026-06-13",
      openingBalance: 1000,
      closingBalance: 2000,
    }))
    expect(res?.success).toBe(true)
    expect(mocks.assertPeriodOpenMock).toHaveBeenCalled()
  })
})

/**
 * Baris rekening koran (`BankStatementLine`).
 *
 * Kelas cacat yang ditutup di sini: model ini dulu hanya punya penulis SEED,
 * sehingga halaman detail rekening koran tidak pernah punya isi dan kolom
 * `BankStatement.totalDebits`/`totalCredits` selalu 0 (dibaca tetapi tak punya
 * jalur tulis). Blok ini mengunci sisi tulisnya: pemetaan debit/kredit yang
 * saling eksklusif, perhitungan ulang total header dari barisnya, izin yang
 * SAMA dengan penulis header (`create_journals`), dan tanggal tengah malam UTC.
 */
describe("Bank Statement Line Actions", () => {
  const lastCreateData = () => {
    const calls = mocks.prismaMock.bankStatementLine.create.mock.calls
    return calls[calls.length - 1][0].data
  }
  const lastUpdateData = () => {
    const calls = mocks.prismaMock.bankStatementLine.update.mock.calls
    return calls[calls.length - 1][0].data
  }

  it("R-09: createBankStatementLine memanggil assertPeriodOpen DI DALAM tx dengan tx", async () => {
    const phases: string[] = []
    mocks.prismaMock.$transaction.mockImplementation(async (cb: any) => {
      phases.push("tx-begin")
      try {
        const out = await cb(mocks.prismaMock)
        phases.push("tx-end")
        return out
      } catch (e) {
        phases.push("tx-abort")
        throw e
      }
    })
    mocks.assertPeriodOpenMock.mockImplementation(async () => {
      phases.push("assert")
    })
    mocks.prismaMock.bankStatementLine.create.mockResolvedValue({ id: 11 })

    const res = await (actions as any).createBankStatementLine(
      fdMap({ bankStatementId: 3, date: "2026-06-13", amount: "1000", type: "debit" }),
    )

    expect(res).toEqual({ success: true, id: 11 })
    // assert terjadi sesudah tx mulai dan sebelum tx selesai — bukan
    // sebelum $transaction dipanggil.
    expect(phases).toEqual(["tx-begin", "assert", "tx-end"])
    expect(mocks.assertPeriodOpenMock).toHaveBeenCalledTimes(1)
    expect(mocks.assertPeriodOpenMock).toHaveBeenCalledWith(
      expect.any(Date),
      mocks.prismaMock,
    )
    expect(mocks.assertPeriodOpenMock.mock.calls[0][1]).toBe(mocks.prismaMock)
  })

  it("R-09: createBankStatement menulis header + assert di dalam tx dengan tx", async () => {
    const phases: string[] = []
    mocks.prismaMock.$transaction.mockImplementation(async (cb: any) => {
      phases.push("tx-begin")
      const out = await cb(mocks.prismaMock)
      phases.push("tx-end")
      return out
    })
    mocks.assertPeriodOpenMock.mockImplementation(async () => {
      phases.push("assert")
    })

    const res = await (actions as any).createBankStatement(
      fdMap({ accountId: 1, date: "2026-06-13", openingBalance: 1000, closingBalance: 2000 }),
    )

    expect(res?.success).toBe(true)
    expect(phases).toEqual(["tx-begin", "assert", "tx-end"])
    expect(mocks.assertPeriodOpenMock).toHaveBeenCalledWith(expect.any(Date), mocks.prismaMock)
    expect(mocks.prismaMock.bankStatement.create).toHaveBeenCalled()
  })

  it("R-09: createJournal mengulang assert di dalam tx dengan tx (cek luar hanya fast-fail)", async () => {
    const txArgs: unknown[] = []
    mocks.assertPeriodOpenMock.mockImplementation(async (...a: any[]) => {
      txArgs.push(a[1])
    })
    const entries = JSON.stringify([
      { accountId: 1, debit: 100, credit: 0, memo: "" },
      { accountId: 2, debit: 0, credit: 100, memo: "" },
    ])

    const res = await (actions as any).createJournal(
      fdMap({ transactionDate: "2026-06-13", description: "t", type: "GENERAL", entries }),
    )

    expect(res?.success).toBe(true)
    // Satu panggilan luar-tx (argumen tx undefined) + satu di dalam tx.
    expect(mocks.assertPeriodOpenMock).toHaveBeenCalledTimes(2)
    expect(txArgs[0]).toBeUndefined()
    expect(txArgs[1]).toBe(mocks.prismaMock)
    expect(mocks.prismaMock.journal.create).toHaveBeenCalled()
  })

  it("createBankStatementLine memetakan type credit ke kolom credit saja", async () => {
    mocks.prismaMock.bankStatementLine.create.mockResolvedValue({ id: 11 })

    const res = await (actions as any).createBankStatementLine(
      fdMap({
        bankStatementId: 3,
        date: "2026-06-13",
        description: "Bunga bank",
        amount: "250000",
        type: "credit",
        reference: "TRF-1",
      }),
    )

    expect(res).toEqual({ success: true, id: 11 })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_journals")
    // R-09: dua argumen — tanggal + tx (objek transaksi yang sama).
    expect(mocks.assertPeriodOpenMock).toHaveBeenCalledWith(expect.any(Date), mocks.prismaMock)

    const data = lastCreateData()
    expect(data.credit).toBe(250000)
    expect(data.debit).toBe(0)
    expect(data.amount).toBe(250000)
    expect(data.type).toBe("credit")
    expect(data.bankStatementId).toBe(3)
    expect(data.description).toBe("Bunga bank")
    expect(data.reference).toBe("TRF-1")
    expect(data.status).toBe("unmatched")
  })

  it("createBankStatementLine memetakan type debit ke kolom debit saja (amount bergaya id-ID)", async () => {
    await (actions as any).createBankStatementLine(
      fdMap({
        bankStatementId: 3,
        date: "2026-06-13",
        // "2.000.000" lewat parseMoneyAmount; `Number("2.000.000")` bernilai 2.
        amount: "2.000.000",
        type: "debit",
      }),
    )

    const data = lastCreateData()
    expect(data.debit).toBe(2000000)
    expect(data.credit).toBe(0)
    expect(data.amount).toBe(2000000)
  })

  it("menolak mutasi rekening koran pada periode yang sudah ditutup", async () => {
    mocks.assertPeriodOpenMock.mockRejectedValue(new Error("Periode akuntansi sudah ditutup"))

    const res = await (actions as any).createBankStatementLine(
      fdMap({ bankStatementId: 3, date: "2026-06-13", amount: "1000", type: "debit" }),
    )

    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Periode akuntansi sudah ditutup")
    expect(mocks.prismaMock.bankStatementLine.create).not.toHaveBeenCalled()
  })

  it("createBankStatementLine menyimpan date sebagai tengah malam UTC", async () => {
    await (actions as any).createBankStatementLine(
      fdMap({ bankStatementId: 3, date: "2026-12-31", amount: "1000", type: "debit" }),
    )

    expect(lastCreateData().date.toISOString()).toBe("2026-12-31T00:00:00.000Z")
  })

  it("createBankStatementLine menghitung ulang totalDebits/totalCredits header dari barisnya", async () => {
    mocks.prismaMock.bankStatementLine.aggregate.mockResolvedValue({
      _sum: { debit: 1500.5, credit: 250.25 },
    })

    const res = await (actions as any).createBankStatementLine(
      fdMap({ bankStatementId: 42, date: "2026-06-13", amount: "1000", type: "debit" }),
    )

    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.bankStatementLine.aggregate).toHaveBeenCalledWith({
      where: { bankStatementId: 42 },
      _sum: { debit: true, credit: true },
    })
    expect(mocks.prismaMock.bankStatement.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { totalDebits: 1500.5, totalCredits: 250.25 },
    })
  })

  it("updateBankStatementLine memetakan ulang kolom dan menghitung ulang total header", async () => {
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })
    mocks.prismaMock.bankStatementLine.aggregate.mockResolvedValue({
      _sum: { debit: 0, credit: 900 },
    })

    const res = await (actions as any).updateBankStatementLine(
      11,
      fdMap({ bankStatementId: 3, date: "2026-07-01", amount: "900", type: "credit" }),
    )

    expect(res).toEqual({ success: true })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_journals")

    const data = lastUpdateData()
    expect(data.debit).toBe(0)
    expect(data.credit).toBe(900)
    expect(data.amount).toBe(900)
    expect(data.date.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(mocks.prismaMock.bankStatement.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { totalDebits: 0, totalCredits: 900 },
    })
  })

  it("updateBankStatementLine menghitung ulang header LAMA bila barisnya pindah rekening koran", async () => {
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })

    await (actions as any).updateBankStatementLine(
      11,
      fdMap({ bankStatementId: 4, date: "2026-07-01", amount: "900", type: "credit" }),
    )

    const ids = mocks.prismaMock.bankStatement.update.mock.calls.map(
      (call: any[]) => call[0].where.id,
    )
    expect(ids).toEqual([4, 3])
  })

  it("updateBankStatementLine memeriksa tanggal LAMA dan BARU terhadap kunci periode", async () => {
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })

    await (actions as any).updateBankStatementLine(
      11,
      fdMap({ bankStatementId: 3, date: "2026-07-01", amount: "900", type: "credit" }),
    )

    // Tanpa pemeriksaan tanggal LAMA, baris periode terkunci bisa "dipindahkan"
    // ke periode terbuka lewat formulir ubah.
    const calls = mocks.assertPeriodOpenMock.mock.calls
    expect(calls).toHaveLength(2)
    expect((calls[0][0] as Date).toISOString()).toBe("2026-06-01T00:00:00.000Z")
    expect((calls[1][0] as Date).toISOString()).toBe("2026-07-01T00:00:00.000Z")
  })

  it("menolak mengubah baris yang sudah masuk rekonsiliasi selesai", async () => {
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })
    mocks.prismaMock.bankReconciliationItem.findFirst.mockResolvedValue({ id: 55 })

    const res = await (actions as any).updateBankStatementLine(
      11,
      fdMap({ bankStatementId: 3, date: "2026-06-13", amount: "900", type: "credit" }),
    )

    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("rekonsiliasi selesai")
    expect(mocks.prismaMock.bankStatementLine.update).not.toHaveBeenCalled()
    // Hanya kecocokan di rekonsiliasi COMPLETED yang membekukan barisnya;
    // kecocokan pada rekonsiliasi draft masih boleh diperbaiki.
    expect(mocks.prismaMock.bankReconciliationItem.findFirst).toHaveBeenCalledWith({
      where: {
        bankStatementLineId: 11,
        matched: true,
        bankReconciliation: { status: "completed" },
      },
      select: { id: true },
    })
  })

  it("deleteBankStatementLine menolak baris yang tidak ada, bukan sukses palsu", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.bankStatementLine.findUnique.mockResolvedValue(null)

    const res = await (actions as any).deleteBankStatementLine(99)

    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("tidak ditemukan")
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_journals")
    expect(mocks.prismaMock.bankStatementLine.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.bankStatement.update).not.toHaveBeenCalled()
  })

  it("deleteBankStatementLine menghapus lalu menghitung ulang total header", async () => {
    mocks.prismaMock.bankStatementLine.findUnique.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })
    mocks.prismaMock.bankStatementLine.aggregate.mockResolvedValue({
      _sum: { debit: 0, credit: 0 },
    })

    const res = await (actions as any).deleteBankStatementLine(11)

    expect(res).toEqual({ success: true })
    expect(mocks.prismaMock.bankStatementLine.delete).toHaveBeenCalledWith({
      where: { id: 11 },
    })
    expect(mocks.prismaMock.bankStatement.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { totalDebits: 0, totalCredits: 0 },
    })
  })

  it("menolak menghapus baris yang sudah masuk rekonsiliasi selesai", async () => {
    mocks.prismaMock.bankStatementLine.findUnique.mockResolvedValue({
      id: 11,
      bankStatementId: 3,
      date: new Date("2026-06-01"),
    })
    mocks.prismaMock.bankReconciliationItem.findFirst.mockResolvedValue({ id: 55 })

    const res = await (actions as any).deleteBankStatementLine(11)

    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("rekonsiliasi selesai")
    expect(mocks.prismaMock.bankStatementLine.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.bankStatement.update).not.toHaveBeenCalled()
  })

  it("tidak menulis baris bila izin create_journals tidak dimiliki", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.requirePermissionMock.mockRejectedValue(new Error("Akses ditolak"))

    const res = await (actions as any).createBankStatementLine(
      fdMap({ bankStatementId: 3, date: "2026-06-13", amount: "1000", type: "debit" }),
    )

    expect(res.success).toBe(false)
    expect(mocks.prismaMock.bankStatementLine.create).not.toHaveBeenCalled()
  })

  it("menolak amount yang tidak positif dan tanggal kosong tanpa menyentuh basis data", async () => {
    const zero = await (actions as any).createBankStatementLine(
      fdMap({ bankStatementId: 3, date: "2026-06-13", amount: "0", type: "debit" }),
    )
    expect(zero.success).toBe(false)
    expect(String(zero.error)).toContain("amount harus lebih dari 0")

    const noDate = await (actions as any).createBankStatementLine(
      fdMap({ bankStatementId: 3, amount: "1000", type: "debit" }),
    )
    expect(noDate.success).toBe(false)
    expect(String(noDate.error)).toContain("Tanggal wajib diisi")

    expect(mocks.prismaMock.bankStatementLine.create).not.toHaveBeenCalled()
  })
})

describe("Journal Actions", () => {
  it("createJournal succeeds", async () => {
    const res = await (actions as any).createJournal(fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("createJournal membaca debit/kredit string id-ID sebagai nominal penuh, bukan pecahan di titik", async () => {
    // Regresi: parseAndValidateJournalEntries memakai Number("2.000.000") === 2.
    // Baris debit 2 jt + kredit 2 jt seimbang tetapi tersimpan 2 rupiah;
    // pasangan tak seimbang dalam format Indonesia (2.000.000 vs 2) juga
    // terbalik tertolak. parseMoneyAmount adalah parser uang repo ini.
    const res = await (actions as any).createJournal(fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([
        { accountId: 1, debit: "2.000.000,50", credit: "" },
        { accountId: 2, debit: "", credit: "2.000.000,50" },
      ]),
    }))
    expect(res?.success).toBe(true)

    const calls = mocks.prismaMock.journalEntry.createMany.mock.calls
    const data = calls[calls.length - 1][0].data
    expect(data.map((entry: { debit: number }) => entry.debit)).toEqual([2000000.5, 0])
    expect(data.map((entry: { credit: number }) => entry.credit)).toEqual([0, 2000000.5])
  })

  it("createJournal menolak debit/kredit string yang tidak bisa dibaca sebagai angka", async () => {
    const res = await (actions as any).createJournal(fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([
        { accountId: 1, debit: "bukan-angka", credit: 0 },
        { accountId: 2, debit: 0, credit: 1000 },
      ]),
    }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
  })

  it.each([
    ["fictitious calendar date 2026-02-30 (no silent roll to March)", "2026-02-30"],
    ["unparseable date instead of letting Invalid Date bypass period lock", "bukan-tanggal"],
  ])("createJournal rejects %s", async (_label, transactionDate) => {
    const res = await (actions as any).createJournal(fdMap({
      transactionDate,
      entries: JSON.stringify([{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }])
    }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled()
  })

  it("updateJournal rejects fictitious calendar date 2026-02-30", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", transactionDate: new Date("2026-06-13"), type: "GENERAL", journalNumber: "JRN-1" })
    const res = await (actions as any).updateJournal(1, fdMap({
      transactionDate: "2026-02-30",
      entries: JSON.stringify([{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }])
    }))
    expect(res?.success).toBe(false)
  })

  /**
   * Pusat laba pada jurnal: masternya ada, tetapi tanpa penulisan per entri laporan
   * pusat laba selalu menumpuk di "Tanpa Pusat Laba".
   */
  it("createJournal menulis pusat laba ke SETIAP entri", async () => {
    const res = await (actions as any).createJournal(fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([
        { accountId: 1, debit: 1000, credit: 0, profitCenterId: 9 },
        { accountId: 2, debit: 0, credit: 1000, profitCenterId: 9 },
      ]),
    }))
    expect(res?.success).toBe(true)

    const calls = mocks.prismaMock.journalEntry.createMany.mock.calls
    const data = calls[calls.length - 1][0].data
    expect(data.map((entry: { profitCenterId: number }) => entry.profitCenterId)).toEqual([9, 9])
  })

  it("createJournal menulis null bila pusat laba tidak dipilih", async () => {
    await (actions as any).createJournal(fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([
        { accountId: 1, debit: 1000, credit: 0 },
        { accountId: 2, debit: 0, credit: 1000 },
      ]),
    }))

    const calls = mocks.prismaMock.journalEntry.createMany.mock.calls
    const data = calls[calls.length - 1][0].data
    expect(data.map((entry: { profitCenterId: number | null }) => entry.profitCenterId)).toEqual([null, null])
  })
  it("updateJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", entries: [{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }] })
    const res = await (actions as any).updateJournal(1, fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }])
    }))
    expect(res?.success).toBe(true)
  })
  it("updateJournal menuntut izin edit_journals, bukan create_journals", async () => {
    // Regresi: gate halaman + ROUTE_PERMS menuntut edit_journals, tetapi action
    // memakai create_journals. Akibatnya pemegang create_journals (tanpa
    // edit_journals) bisa menyunting jurnal langsung lewat action (escalation),
    // sementara pemegang edit_journals gagal saat menyimpan.
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", transactionDate: new Date("2024-01-01"), type: "GENERAL" })
    await (actions as any).updateJournal(1, fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }, { accountId: 2, debit: 0, credit: 100 }]),
    }))
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_journals")
    expect(mocks.requirePermissionMock).not.toHaveBeenCalledWith("create_journals")
  })
  it("postJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", entries: [{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }] })
    const res = await (actions as any).postJournal(1)
    expect(res?.success).toBe(true)
  })
  it("reverseJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED", isReversed: false, entries: [{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }] })
    const res = await (actions as any).reverseJournal(1)
    expect(res?.success).toBe(true)
  })
  it("deleteJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT" })
    const res = await (actions as any).deleteJournal(1)
    expect(res?.success).toBe(true)
  })
})

describe("Expense Actions", () => {
  it("createExpense succeeds", async () => {
    const res = await (actions as any).createExpense(fdMap({
      accountId: 1,
      amount: 1000,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("createExpense persists Nama Project + Vendor", async () => {
    const res = await (actions as any).createExpense(fdMap({
      accountId: 1,
      amount: 1000,
      date: "2026-06-13",
      projectId: 7,
      categoryId: 3,
      vendorId: 12,
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 7, categoryId: 3, vendorId: 12 }),
      }),
    )
  })
  it("createExpense defaults vendor/project to null when omitted", async () => {
    const res = await (actions as any).createExpense(fdMap({
      accountId: 1,
      amount: 1000,
      date: "2026-06-13",
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: null, categoryId: null, vendorId: null }),
      }),
    )
  })
  it("updateExpense succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions as any).updateExpense(1, fdMap({
      accountId: 1,
      amount: 1200,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("updateExpense rejects non-positive amount (Zod parity with create)", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions as any).updateExpense(1, fdMap({
      accountId: 1,
      amount: -50,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Validasi gagal/)
    // The invalid edit must never reach the DB.
    expect(mocks.prismaMock.expense.update).not.toHaveBeenCalled()
  })
  it("approveExpense succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions as any).approveExpense(1)
    expect(res?.success).toBe(true)
  })
  it("markExpensePaid succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved", paidFromAccountId: 200 })
    const res = await (actions as any).markExpensePaid(1)
    expect(res?.success).toBe(true)
  })
  it("markExpensePaid rejects an expense without a source account and never flips it to paid", async () => {
    // The old flow posted nothing (onExpenseApproved returned early) yet still set
    // status = "paid": cash out with no GL trace. Now it refuses up front.
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved", paidFromAccountId: null })
    const res = await (actions as any).markExpensePaid(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/akun sumber dana/i)
    expect(mocks.prismaMock.expense.update).not.toHaveBeenCalled()
  })
  it("markExpensePaid succeeds with unchanged balance (line 378)", async () => {
    // Return expense in approved state
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, amount: 100, status: "approved",
      paymentMethodId: 1, paidFromAccountId: 200
    })
    mocks.prismaMock.paymentMethod.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, type: "PETTY_CASH"
    })
    
    // For recalculate chain logic, simulate no change needed:
    mocks.prismaMock.pettyCash.findFirst.mockResolvedValueOnce({ id: 1, balanceAfter: 1000 })
    mocks.prismaMock.pettyCash.findMany.mockResolvedValueOnce([
      { id: 2, amount: 100, balanceBefore: 1000, balanceAfter: 900 }
    ])
    
    const res = await (actions as any).markExpensePaid(1)
    expect(res?.success).toBe(true)
  })
  it("deleteExpense succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, isPosted: false })
    const res = await (actions as any).deleteExpense(1)
    expect(res?.success).toBe(true)
  })
})

describe("Petty Cash Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.pettyCash.create.mockResolvedValue({ id: 1, documentNo: "PC-01" })
    mocks.prismaMock.pettyCash.update.mockResolvedValue({ id: 1, documentNo: "PC-01" })
    mocks.prismaMock.pettyCash.delete.mockResolvedValue({ id: 1, documentNo: "PC-01" })
    mocks.prismaMock.pettyCash.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", documentNo: "PC-01" })
  })

  it("createPettyCash succeeds", async () => {
    const res = await (actions as any).createPettyCash(fdMap({
      type: "IN",
      amount: 1000,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  // AUD-02: saldo sumber divalidasi DI DALAM transaksi sesudah lock akun
  // sumber, bukan dari snapshot sebelum transaksi.
  it("createPettyCash IN menolak saldo sumber kurang di dalam transaksi", async () => {
    mocks.prismaMock.journalEntry.findMany.mockResolvedValue([{ debit: 500, credit: 0 }])
    const res = await (actions as any).createPettyCash(fdMap({
      type: "IN",
      amount: 1000,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(false)
    expect(String(res?.error ?? "")).toMatch(/Saldo akun Kas\/Bank tidak mencukupi/)
    expect(mocks.prismaMock.pettyCash.create).not.toHaveBeenCalled()
  })
  it("createPettyCash IN meloloskan saldo sumber 3x100.10 untuk IN 300.30 (anti float-drift)", async () => {
    // Regresi: reduce mentah s + Number(debit) - Number(credit) menghasilkan
    // 300.29999999999995 < 300.30 sehingga IN sah ditolak; safeAdd/safeSubtract
    // per langkah (pola repo) menghasilkan 300.30 persis.
    mocks.prismaMock.journalEntry.findMany.mockResolvedValue([
      { debit: 100.10, credit: 0 },
      { debit: 100.10, credit: 0 },
      { debit: 100.10, credit: 0 },
    ])
    const res = await (actions as any).createPettyCash(fdMap({
      type: "IN",
      amount: 300.30,
      date: "2026-06-13",
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.pettyCash.create).toHaveBeenCalled()
  })
  it("createPettyCash IN mengunci akun sumber sebelum membaca saldo jurnal", async () => {
    const res = await (actions as any).createPettyCash(fdMap({
      type: "IN",
      amount: 1000,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
    const lockOrder = mocks.prismaMock.$queryRaw.mock.invocationCallOrder[0]
    const readOrder = mocks.prismaMock.journalEntry.findMany.mock.invocationCallOrder[0]
    const createOrder = mocks.prismaMock.pettyCash.create.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(readOrder)
    expect(readOrder).toBeLessThan(createOrder)
  })
  it("createPettyCash persists Nama Project + Vendor + Kategori", async () => {
    // The create runs inside a tx; the model mock's create is the same fn.
    const res = await (actions as any).createPettyCash(fdMap({
      type: "IN",
      amount: 20000,
      date: "2026-06-13",
      projectId: 5,
      vendorId: 9,
      categoryId: 2,
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.pettyCash.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 5, vendorId: 9, categoryId: 2 }),
      }),
    )
  })
  it("updatePettyCash succeeds with unchanged balance (line 378)", async () => {
    // 1) Find existing record to pass schema check
    mocks.prismaMock.pettyCash.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, type: "OUT", amount: 500, date: new Date("2026-06-13"), balanceBefore: 1000, balanceAfter: 500
    })
    
    // 2) During recalculation, findMany returns identical values to computed chain (re-run starts running from 0)
    mocks.prismaMock.pettyCash.findMany.mockResolvedValueOnce([
      { id: 1, amount: 1000, type: "IN", balanceBefore: 0, balanceAfter: 1000 },
      { id: 2, amount: 500, type: "OUT", balanceBefore: 1000, balanceAfter: 500 }
    ])
    
    const res = await (actions as any).updatePettyCash(1, fdMap({
      type: "OUT", amount: 500, date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("updatePettyCash succeeds", async () => {
    const res = await (actions as any).updatePettyCash(1, fdMap({
      type: "OUT",
      amount: 500,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("updatePettyCash rejects invalid type and non-positive amount (Zod parity)", async () => {
    const res = await (actions as any).updatePettyCash(1, fdMap({
      type: "INVALID_TYPE",
      amount: -100,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Validasi gagal/)
    expect(mocks.prismaMock.pettyCash.update).not.toHaveBeenCalled()
  })
  it("deletePettyCash tanpa alasan ditolak sebelum mutasi (GL-BR-003 P6 void beralasan)", async () => {
    // Kontrak void: alasan wajib; tanpa alasan = tolak sebelum mutasi apa pun.
    const res = await (actions as any).deletePettyCash(1)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/alasan/i)
    expect(mocks.prismaMock.pettyCash.update).not.toHaveBeenCalled()
  })
})

describe("Bank Reconciliation Actions", () => {
  it("match/create/complete menegakkan manage_bank_reconciliation (bukan post_journals)", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", accountId: 10, periodStart: null, periodEnd: null })
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({ date: new Date("2026-06-13"), bankStatement: { accountId: 10 } })
    mocks.prismaMock.journalEntry.findUniqueOrThrow.mockResolvedValue({ accountId: 10, journal: { status: "POSTED", deletedAt: null, transactionDate: new Date("2026-06-13") } })
    await (actions.matchReconciliationLine as any)(1, 1, 1)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("manage_bank_reconciliation")
    expect(mocks.requirePermissionMock).not.toHaveBeenCalledWith("post_journals")
  })
  it("createBankReconciliation succeeds", async () => {
    const res = await (actions as any).createBankReconciliation(fdMap({
      accountId: 1,
      statementDate: "2026-06-13",
      statementBalance: 5000
    }))
    expect(res?.success).toBe(true)
  })
  it("matchReconciliationLine succeeds", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", accountId: 10, periodStart: null, periodEnd: null })
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({ date: new Date("2026-06-13"), amount: 1000, type: "debit", debit: 1000, credit: 0, bankStatement: { accountId: 10 } })
    mocks.prismaMock.journalEntry.findUniqueOrThrow.mockResolvedValue({ accountId: 10, debit: 1000, credit: 0, journal: { status: "POSTED", deletedAt: null, transactionDate: new Date("2026-06-13") } })
    const res = await (actions.matchReconciliationLine as any)(1, 1, 1)
    expect(res?.success).toBe(true)
  })
  it("completeReconciliation succeeds", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", bookBalance: 1000, statementBalance: 1000, items: [{ matched: true, cleared: true, bankStatementLineId: 1, journalEntryId: 1, type: null, amount: 0 }] })
    const res = await (actions as any).completeReconciliation(1)
    expect(res?.success).toBe(true)
  })

  it("rejects a statement line from another account", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", accountId: 10, periodStart: null, periodEnd: null })
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({ date: new Date("2026-06-13"), bankStatement: { accountId: 99 } })

    const res = await (actions.matchReconciliationLine as any)(1, 1, 1)

    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("bukan milik akun")
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("menolak mencocokkan jurnal yang belum diposting", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", accountId: 10, periodStart: null, periodEnd: null })
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({ date: new Date("2026-06-13"), bankStatement: { accountId: 10 } })
    mocks.prismaMock.journalEntry.findUniqueOrThrow.mockResolvedValue({ accountId: 10, journal: { status: "DRAFT", deletedAt: null, transactionDate: new Date("2026-06-13") } })

    const res = await (actions.matchReconciliationLine as any)(1, 1, 1)

    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("posted")
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("menolak baris rekening koran di luar periode rekonsiliasi", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", accountId: 10, periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-07-31") })
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({ date: new Date("2026-06-13"), bankStatement: { accountId: 10 } })

    const res = await (actions.matchReconciliationLine as any)(1, 1, 1)

    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("di luar periode")
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("rejects completing an empty reconciliation", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })

    const res = await (actions as any).completeReconciliation(1)

    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("belum memiliki baris")
    expect(mocks.prismaMock.bankReconciliation.update).not.toHaveBeenCalled()
  })
})


describe("Cost Center Actions", () => {
  it("createCostCenter succeeds", async () => {
    const res = await (actions as any).createCostCenter(fdMap({
      code: "CC-001",
      name: "Cost Center 1",
      isActive: "true"
    }))
    expect(res?.success).toBe(true)
  })

  /**
   * Pusat laba: model `ProfitCenter` sebelumnya tidak punya jalur tulis sama sekali
   * (hanya skrip seed), padahal laporan pusat laba membacanya.
   */
  describe("Profit Center Actions", () => {
    it("createProfitCenter menulis kode dan nama", async () => {
      mocks.prismaMock.profitCenter.create.mockResolvedValue({ id: 7 })
      const res = await (actions as any).createProfitCenter(
        fdMap({ code: "PC-01", name: "Pusat Laba Jakarta" }),
      )

      expect(res).toEqual({ success: true, id: 7 })
      expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_profit_centers")
      const arg = mocks.prismaMock.profitCenter.create.mock.calls[0][0]
      expect(arg.data).toEqual({ code: "PC-01", name: "Pusat Laba Jakarta" })
    })

    it("createProfitCenter menolak kode/nama kosong tanpa menyentuh basis data", async () => {
      const res = await (actions as any).createProfitCenter(fdMap({ code: "", name: "" }))
      expect(res.success).toBe(false)
      expect(String(res.error)).toContain("Kode wajib diisi")
      expect(mocks.prismaMock.profitCenter.create).not.toHaveBeenCalled()
    })

    it("createProfitCenter memetakan kode duplikat ke pesan yang terbaca", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      mocks.prismaMock.profitCenter.create.mockRejectedValue(
        new Error("Unique constraint failed on the fields: (`code`)"),
      )
      const res = await (actions as any).createProfitCenter(
        fdMap({ code: "PC-01", name: "Duplikat" }),
      )
      expect(res).toEqual({ success: false, error: "Kode pusat laba sudah digunakan" })
    })

    it("updateProfitCenter memakai izin edit_profit_centers", async () => {
      mocks.prismaMock.profitCenter.update.mockResolvedValue({})
      const res = await (actions as any).updateProfitCenter(
        7,
        fdMap({ code: "PC-01", name: "Pusat Laba Bandung" }),
      )
      expect(res).toEqual({ success: true })
      expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_profit_centers")
    })

    it("deleteProfitCenter memakai izin delete_profit_centers", async () => {
      mocks.prismaMock.profitCenter.delete.mockResolvedValue({})
      const res = await (actions as any).deleteProfitCenter(7)
      expect(res).toEqual({ success: true })
      expect(mocks.requirePermissionMock).toHaveBeenCalledWith("delete_profit_centers")
      expect(mocks.prismaMock.profitCenter.delete).toHaveBeenCalledWith({ where: { id: 7 } })
    })
  })
  it("updateCostCenter succeeds", async () => {
    mocks.prismaMock.costCenter.findUniqueOrThrow.mockResolvedValue({ id: 1 })
    const res = await (actions as any).updateCostCenter(1, fdMap({
      code: "CC-001",
      name: "Cost Center 1 Updated"
    }))
    expect(res?.success).toBe(true)
  })
  it("deleteCostCenter succeeds", async () => {
    const res = await (actions as any).deleteCostCenter(1)
    expect(res?.success).toBe(true)
  })

  it("deleteCostCenter menolak bila ada pusat biaya anak tanpa menghapus", async () => {
    mocks.prismaMock.costCenter.count.mockResolvedValueOnce(2)
    const res = await (actions as any).deleteCostCenter(1)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("2 pusat biaya anak")
    expect(mocks.prismaMock.costCenter.delete).not.toHaveBeenCalled()
  })

  it("deleteCostCenter menolak bila dirujuk dokumen operasional tanpa menghapus", async () => {
    mocks.prismaMock.costCenter.count.mockResolvedValueOnce(0)
    mocks.prismaMock.payroll.count.mockResolvedValueOnce(3)
    const res = await (actions as any).deleteCostCenter(1)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("3 penggajian")
    expect(mocks.prismaMock.costCenter.delete).not.toHaveBeenCalled()
  })

  it("deleteProfitCenter menolak bila dipakai pusat biaya tanpa menghapus", async () => {
    mocks.prismaMock.costCenter.count.mockResolvedValueOnce(4)
    const res = await (actions as any).deleteProfitCenter(7)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toContain("4 pusat biaya")
    expect(mocks.prismaMock.profitCenter.delete).not.toHaveBeenCalled()
  })
})


describe('Finance Actions Error Paths', () => {
  it("createBankStatement handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.bankStatement.create.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).createBankStatement(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("createJournal handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.journal.create.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).createJournal(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("updateJournal handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.journal.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).updateJournal(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("postJournal handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.journal.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).postJournal(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("reverseJournal handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.journal.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).reverseJournal(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("deleteJournal handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.journal.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).deleteJournal(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("createExpense handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.expense.create.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).createExpense(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("updateExpense handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.expense.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).updateExpense(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("approveExpense handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.expense.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).approveExpense(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("markExpensePaid handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.expense.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).markExpensePaid(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("deleteExpense handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.expense.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).deleteExpense(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("createPettyCash handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.pettyCash.create.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).createPettyCash(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("updatePettyCash handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.pettyCash.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).updatePettyCash(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("deletePettyCash handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.pettyCash.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).deletePettyCash(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("createBankReconciliation handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.bankReconciliation.create.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).createBankReconciliation(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("matchReconciliationLine handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions.matchReconciliationLine as any)(1, 1, 1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("completeReconciliation handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).completeReconciliation(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("createCostCenter handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.costCenter.create.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).createCostCenter(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("updateCostCenter handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.costCenter.update.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).updateCostCenter(1, fdMap({
      code: "CC-001",
      name: "Cost Center 1 Updated",
      isActive: "true"
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("deleteCostCenter handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.costCenter.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).deleteCostCenter(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
})


describe("Additional Branches", () => {
  it("deleteExpense rejects approved or paid", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved" })
    const res = await actions.deleteExpense(1)
    expect(res.success).toBe(false)
  })

  it("updateExpense rejects non-draft", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved" })
    const fd = fdMap({ amount: 100, date: "2024-01-01", accountId: 1 })
    const res = await actions.updateExpense(1, fd)
    expect(res.success).toBe(false)
  })

  it("reverseJournal recovers from error inside tx", async () => {
    // Claim + reversal are atomic in one tx now: a tx throw rolls both back,
    // the journal stays POSTED, and the action surfaces the failure.
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED" })
    mocks.prismaMock.$transaction.mockImplementationOnce(async () => { throw new Error("Tx fail") })
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Tx fail/i)
  })

  it("createBankStatement validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.createBankStatement(new FormData())).success).toBe(false)
  })

  it("createJournal validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.createJournal(new FormData())).success).toBe(false)
  })

  it("updateJournal validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.updateJournal(1, new FormData())).success).toBe(false)
  })

  it("createExpense validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.createExpense(new FormData())).success).toBe(false)
  })

  it("createPettyCash validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.createPettyCash(new FormData())).success).toBe(false)
  })

  it("createCostCenter validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.createCostCenter(new FormData())).success).toBe(false)
  })

  it("updateCostCenter validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.updateCostCenter(1, new FormData())).success).toBe(false)
  })

  it("postJournal rejects unbalanced entries", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ 
      id: 1, status: "DRAFT", entries: [{ debit: 100, credit: 0 }, { debit: 0, credit: 50 }] 
    })
    const res = await actions.postJournal(1)
    expect(res.success).toBe(false)
  })

  it("createJournal covers attachment update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.create.mockResolvedValue({ id: 1 })
    const fd = fdMap({ transactionDate: "2024-01-01", entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }, { accountId: 2, debit: 0, credit: 100 }]), attachmentIds: "[1, 2]" })
    const res = await actions.createJournal(fd)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
  })

  it("createExpense covers attachment update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.create.mockResolvedValue({ id: 1 })
    const fd = fdMap({ amount: 100, date: "2024-01-01", accountId: 1, attachmentIds: "[3, 4]" })
    const res = await actions.createExpense(fd)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
  })

  it("createPettyCash covers attachment update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.create.mockResolvedValue({ id: 1 })
    const fd = fdMap({ amount: 100, type: "IN", date: "2024-01-01", accountId: 1, attachmentIds: "[5, 6]" })
    const res = await actions.createPettyCash(fd)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
  })

  it("updateJournal covers attachment update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.update.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", transactionDate: new Date("2024-01-01") })
    const fd = fdMap({ transactionDate: "2024-01-01", entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }, { accountId: 2, debit: 0, credit: 100 }]), attachmentIds: "[7, 8]" })
    const res = await actions.updateJournal(1, fd)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
  })

  it("ISF-01: createJournal gagal total bila klaim lampiran gagal (tidak ada jurnal yatim)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    // $transaction menangkap error callback sebagai rollback: produksi Prisma
    // mengembalikan tx yang dibatalkan. Mock mereplikasi itu — bila klaim
    // berjalan DI LUAR tx (kode lama), callback tx sukses dan action sukses.
    mocks.prismaMock.$transaction.mockImplementationOnce(async (fn: any) => {
      mocks.prismaMock.journal.create.mockResolvedValue({ id: 1 })
      return fn(mocks.prismaMock)
    })
    mocks.prismaMock.transactionAttachment.updateMany.mockRejectedValueOnce(new Error("klaim lampiran gagal"))
    const fd = fdMap({ transactionDate: "2024-01-01", entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }, { accountId: 2, debit: 0, credit: 100 }]), attachmentIds: "[1, 2]" })
    const res = await actions.createJournal(fd)
    expect(res.success).toBe(false)
    expect(mocks.logActivityMock).not.toHaveBeenCalledWith("create", "Journal", 1, "Membuat jurnal")
  })

  it("ISF-01: updateJournal gagal total bila klaim lampiran gagal (perubahan tidak dilaporkan sukses)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.update.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", transactionDate: new Date("2024-01-01") })
    mocks.prismaMock.transactionAttachment.updateMany.mockRejectedValueOnce(new Error("klaim lampiran gagal"))
    const fd = fdMap({ transactionDate: "2024-01-01", entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }, { accountId: 2, debit: 0, credit: 100 }]), attachmentIds: "[7, 8]" })
    const res = await actions.updateJournal(1, fd)
    expect(res.success).toBe(false)
    expect(mocks.logActivityMock).not.toHaveBeenCalledWith("update", "Journal", 1, "Memperbarui jurnal")
  })

  it("updatePettyCash covers attachment update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findUniqueOrThrow.mockResolvedValue({ id: 1, documentNo: "PC-01" })
    mocks.prismaMock.pettyCash.update.mockResolvedValue({ id: 1 })
    const fd = fdMap({ amount: 100, type: "IN", date: "2024-01-01", accountId: 1, attachmentIds: "[9, 10]" })
    const res = await actions.updatePettyCash(1, fd)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
  })

  it("recalcPettyCashChain triggers negative balance error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findMany.mockResolvedValue([{ id: 1, documentNo: "PC-01", type: "OUT", amount: 100, balanceBefore: 0, balanceAfter: -100 }])
    vi.mocked(findFirstNegativeBalance).mockReturnValueOnce({ record: { id: 1, documentNo: "PC-01" }, balanceAfter: -100 } as any)
    const fd = fdMap({ amount: 50, type: "OUT", date: "2024-01-01", accountId: 1 })
    const res = await actions.createPettyCash(fd)
    expect(res.success).toBe(false)
  })

  it("recalcPettyCashChain updates balance chain when differs", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findMany.mockResolvedValue([{ id: 1, documentNo: "PC-01", type: "IN", amount: 100, balanceBefore: 0, balanceAfter: 100 }])
    vi.mocked(computePettyCashChain).mockReturnValueOnce([{ id: 1, balanceBefore: 0, balanceAfter: 150 }] as any)
    mocks.prismaMock.pettyCash.update.mockResolvedValue({ id: 1 })
    const fd = fdMap({ amount: 100, type: "IN", date: "2024-01-01", accountId: 1 })
    const res = await actions.createPettyCash(fd)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.pettyCash.update).toHaveBeenCalled()
  })

  it("deletePettyCash beralasan = void: jurnal asal dipertahankan, fisik tidak dihapus", async () => {
    // GL-BR-003 P6: hard-delete dilarang; void = status void + deletedAt,
    // jurnal lawan via helper (di-mock di berkas ini), lampiran tidak dihapus.
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "posted", documentNo: "PC-01",
      date: new Date("2026-09-15"), transactionDate: null,
    })
    const res = await actions.deletePettyCash(1, "Salah input, koreksi via void")
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.pettyCash.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    )
    expect(mocks.prismaMock.pettyCash.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.journal.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.journalEntry.deleteMany).not.toHaveBeenCalled()
    expect(mocks.logActivityMock).toHaveBeenCalledWith("void", "PettyCash", 1, expect.stringContaining("PC-01"))
  })
})


describe("More Action Branches", () => {
  it("updateExpense success path with attachments", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.expense.update.mockResolvedValue({ id: 1 })
    const fd = fdMap({ amount: 100, date: "2024-01-01", accountId: 1, attachmentIds: "[10, 20]" })
    const res = await actions.updateExpense(1, fd)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
  })

  it("ISF-01 sekelas: updateExpense gagal total bila klaim lampiran gagal", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.expense.update.mockResolvedValue({ id: 1 })
    mocks.prismaMock.transactionAttachment.updateMany.mockRejectedValueOnce(new Error("klaim lampiran gagal"))
    const fd = fdMap({ amount: 100, date: "2024-01-01", accountId: 1, attachmentIds: "[10, 20]" })
    const res = await actions.updateExpense(1, fd)
    expect(res.success).toBe(false)
    expect(mocks.logActivityMock).not.toHaveBeenCalledWith("update", "Expense", 1, "Memperbarui pengeluaran")
  })

  it("ISF-01 sekelas: updatePettyCash gagal total bila klaim lampiran gagal", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findUniqueOrThrow.mockResolvedValue({ id: 1, documentNo: "PC-01" })
    mocks.prismaMock.pettyCash.update.mockResolvedValue({ id: 1 })
    mocks.prismaMock.transactionAttachment.updateMany.mockRejectedValueOnce(new Error("klaim lampiran gagal"))
    const fd = fdMap({ amount: 100, type: "IN", date: "2024-01-01", accountId: 1, attachmentIds: "[9, 10]" })
    const res = await actions.updatePettyCash(1, fd)
    expect(res.success).toBe(false)
    expect(mocks.logActivityMock).not.toHaveBeenCalledWith("update", "PettyCash", 1, "Memperbarui transaksi kas kecil")
  })

  it("reverseJournal concurrent claim rejection (REVERSED)", async () => {
    // In-tx re-read sees REVERSED → reject before any claim; no second lookup.
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "REVERSED" })
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Jurnal sudah pernah dibalik/i)
    expect(mocks.prismaMock.journal.updateMany).not.toHaveBeenCalled()
  })

  it("reverseJournal concurrent claim rejection (DRAFT)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT" })
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Jurnal tidak bisa dibalik/i)
    expect(mocks.prismaMock.journal.updateMany).not.toHaveBeenCalled()
  })

  it("matchReconciliationLine existing item update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      status: "draft", accountId: 10, periodStart: null, periodEnd: null,
    })
    mocks.prismaMock.bankStatementLine.findUniqueOrThrow.mockResolvedValue({
      date: new Date("2026-06-13"), amount: 1000, type: "debit", debit: 1000, credit: 0, bankStatement: { accountId: 10 },
    })
    mocks.prismaMock.journalEntry.findUniqueOrThrow.mockResolvedValue({
      accountId: 10,
      debit: 1000,
      credit: 0,
      journal: { status: "POSTED", deletedAt: null, transactionDate: new Date("2026-06-13") },
    })
    mocks.prismaMock.bankReconciliationItem.findFirst.mockImplementation(async (args: any) =>
      // R-03 reuse-check (where ada journalEntryId) → belum dipakai;
      // dedupe-check baris (hanya bankStatementLineId) → item lama ada.
      args?.where?.journalEntryId != null ? null : { id: 1 },
    )
    mocks.prismaMock.bankReconciliationItem.update.mockResolvedValue({ id: 1 })
    const res = await actions.matchReconciliationLine(1, 1, 1)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.bankReconciliationItem.update).toHaveBeenCalled()
  })

  it("completeReconciliation unmatched items rejection", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", items: [{ matched: false, bankStatementLineId: 1, journalEntryId: null }]
    })
    const res = await actions.completeReconciliation(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Semua baris harus di-match/i)
  })

  it("completeReconciliation lolos dengan matched + adjustment valid (R-01)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", bookBalance: 1000, statementBalance: 900,
      items: [
        { matched: true, cleared: true, bankStatementLineId: 5, journalEntryId: 6, type: null, amount: 0 },
        { matched: false, cleared: false, bankStatementLineId: null, journalEntryId: null, type: "outstanding_deposit", amount: 100 },
      ],
    })
    mocks.prismaMock.bankReconciliation.updateMany.mockResolvedValue({ count: 1 })
    const res = await actions.completeReconciliation(1)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.bankReconciliation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ adjustedBookBalance: 1000, difference: 0 }),
      }),
    )
  })

  it("completeReconciliation contoh audit selisih = 0 (R-02)", async () => {
    // buku 1000, bank 900, deposit 100 → adjusted 1000, difference 0.
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", bookBalance: 1000, statementBalance: 900,
      items: [
        { matched: true, cleared: true, bankStatementLineId: 5, journalEntryId: 6, type: null, amount: 500 },
        { matched: false, cleared: false, bankStatementLineId: null, journalEntryId: null, type: "outstanding_deposit", amount: 100 },
      ],
    })
    mocks.prismaMock.bankReconciliation.updateMany.mockResolvedValue({ count: 1 })
    const res = await actions.completeReconciliation(1)
    expect(res.success).toBe(true)
    const arg = mocks.prismaMock.bankReconciliation.updateMany.mock.calls[0][0]
    expect(arg.data.adjustedBookBalance).toBe(1000)
    expect(arg.data.difference).toBe(0)
  })

  it("completeReconciliation menolak adjustment cleared", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", bookBalance: 1000, statementBalance: 1000,
      items: [
        { matched: false, cleared: true, bankStatementLineId: null, journalEntryId: null, type: "outstanding_deposit", amount: 100 },
      ],
    })
    const res = await actions.completeReconciliation(1)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/penyesuaian tidak valid/i)
  })

  it("completeReconciliation menolak selisih >= 0.01", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", bookBalance: 1000, statementBalance: 900,
      items: [
        { matched: true, cleared: true, bankStatementLineId: 5, journalEntryId: 6, type: null, amount: 0 },
      ],
    })
    const res = await actions.completeReconciliation(1)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/belum seimbang/i)
  })

  it("createReconciliationAdjustment menulis item penyesuaian (R-11)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft",
    })
    mocks.prismaMock.bankReconciliationItem.create.mockResolvedValue({ id: 7 })
    const res = await actions.createReconciliationAdjustment(1, fdMap({
      type: "outstanding_deposit",
      amount: "1500000",
      date: "2026-06-13",
      description: "Setoran beredar",
    }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.bankReconciliationItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bankReconciliationId: 1,
        bankStatementLineId: null,
        journalEntryId: null,
        type: "outstanding_deposit",
        amount: 1500000,
        cleared: false,
        matched: false,
      }),
    })
  })

  it("createReconciliationAdjustment menolak nominal id-ID yang salah parse", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft",
    })
    // "1.500.000" = satu koma lima juta via parseMoneyAmount, bukan 1.
    const res = await actions.createReconciliationAdjustment(1, fdMap({
      type: "outstanding_check",
      amount: "1.500.000",
      date: "2026-06-13",
    }))
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.bankReconciliationItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 1500000 }),
    })
  })

  it("createReconciliationAdjustment menolak tanggal kalender fiktif", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    const res = await actions.createReconciliationAdjustment(1, fdMap({
      type: "outstanding_deposit",
      amount: "1000",
      date: "2026-02-30",
    }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Tanggal penyesuaian tidak valid")
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("createReconciliationAdjustment menolak jenis tak dikenal", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    const res = await actions.createReconciliationAdjustment(1, fdMap({
      type: "fiktif",
      amount: "1000",
      date: "2026-06-13",
    }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Jenis penyesuaian")
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("createReconciliationAdjustment menolak recon completed", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "completed",
    })
    const res = await actions.createReconciliationAdjustment(1, fdMap({
      type: "outstanding_deposit",
      amount: "1000",
      date: "2026-06-13",
    }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/draft/i)
    expect(mocks.prismaMock.bankReconciliationItem.create).not.toHaveBeenCalled()
  })

  it("unmatchReconciliationLine menghapus item recon draft", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft",
    })
    mocks.prismaMock.bankReconciliationItem.findUniqueOrThrow.mockResolvedValue({
      id: 9, bankReconciliationId: 1,
    })
    mocks.prismaMock.bankReconciliationItem.delete.mockResolvedValue({ id: 9 })
    const res = await actions.unmatchReconciliationLine(1, 9)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.bankReconciliationItem.delete).toHaveBeenCalledWith({
      where: { id: 9 },
    })
  })

  it("unmatchReconciliationLine menolak recon completed", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "completed",
    })
    const res = await actions.unmatchReconciliationLine(1, 9)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/draft/i)
    expect(mocks.prismaMock.bankReconciliationItem.delete).not.toHaveBeenCalled()
  })

  it("unmatchReconciliationLine menolak item milik recon lain", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft",
    })
    mocks.prismaMock.bankReconciliationItem.findUniqueOrThrow.mockResolvedValue({
      id: 9, bankReconciliationId: 2,
    })
    const res = await actions.unmatchReconciliationLine(1, 9)
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("bukan milik rekonsiliasi ini")
    expect(mocks.prismaMock.bankReconciliationItem.delete).not.toHaveBeenCalled()
  })

  it("deleteJournal rejects POSTED journal", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED" })
    const res = await actions.deleteJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Tidak bisa menghapus journal yang sudah POSTED/i)
  })

  it("updateJournal rejects negative debit/credit", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", transactionDate: new Date("2024-01-01") })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([
        { accountId: 1, debit: -100, credit: 100 },
        { accountId: 2, debit: 100, credit: -100 }
      ])
    })
    const res = await actions.updateJournal(1, fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Nominal debit\/credit tidak boleh negatif/i)
  })

  it("updateJournal rejects line with both debit and credit", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", transactionDate: new Date("2024-01-01") })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([
        { accountId: 1, debit: 50, credit: 50 },
        { accountId: 2, debit: 50, credit: 50 }
      ])
    })
    const res = await actions.updateJournal(1, fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Satu baris tidak boleh memiliki debit dan credit sekaligus/i)
  })

  it("reverseJournal rejects non-POSTED journal", async () => {
    // Status is re-read inside the tx after the lock — the mock's $transaction
    // passes the same client, so the outer findUniqueOrThrow doubles as the
    // in-tx re-read. New message names the actual status.
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT" })
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Jurnal tidak bisa dibalik \(status: DRAFT\)/i)
  })
})

describe("Next.js redirect error handling", () => {
  const redirectErr = new Error("NEXT_REDIRECT")
  ;(redirectErr as any).digest = "NEXT_REDIRECT;replace;/login;307;"

  const fnsToTest = [
    { name: "createBankStatement", fn: () => actions.createBankStatement(new FormData()) },
    { name: "createJournal", fn: () => actions.createJournal(new FormData()) },
    { name: "postJournal", fn: () => actions.postJournal(1) },
    { name: "createExpense", fn: () => actions.createExpense(new FormData()) },
    { name: "approveExpense", fn: () => actions.approveExpense(1) },
    { name: "markExpensePaid", fn: () => actions.markExpensePaid(1) },
    { name: "createPettyCash", fn: () => actions.createPettyCash(new FormData()) },
    { name: "createBankReconciliation", fn: () => actions.createBankReconciliation(new FormData()) },
    { name: "matchReconciliationLine", fn: () => actions.matchReconciliationLine(1, 1, 1) },
    { name: "completeReconciliation", fn: () => actions.completeReconciliation(1) },
    { name: "createCostCenter", fn: () => actions.createCostCenter(new FormData()) },
    { name: "updateCostCenter", fn: () => actions.updateCostCenter(1, new FormData()) },
    { name: "deleteJournal", fn: () => actions.deleteJournal(1) },
    { name: "deleteExpense", fn: () => actions.deleteExpense(1) },
    { name: "deletePettyCash", fn: () => actions.deletePettyCash(1) },
    { name: "deleteCostCenter", fn: () => actions.deleteCostCenter(1) },
    { name: "updateJournal", fn: () => actions.updateJournal(1, new FormData()) },
    { name: "reverseJournal", fn: () => actions.reverseJournal(1) },
    { name: "updateExpense", fn: () => actions.updateExpense(1, new FormData()) },
    { name: "updatePettyCash", fn: () => actions.updatePettyCash(1, new FormData()) },
  ]

  it("should rethrow NEXT_REDIRECT errors", async () => {
    vi.mocked(mocks.requirePermissionMock).mockRejectedValue(redirectErr)
    
    for (const { fn } of fnsToTest) {
      await expect(fn()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") })
    }
  })
  
  it("should fallback to error object when getErrorMessage returns empty", async () => {
    vi.mocked(mocks.requirePermissionMock).mockRejectedValue("")
    
    for (const { fn } of fnsToTest) {
      const res = await fn()
      expect(res.success).toBe(false)
    }
  })
})

describe("Status guard branches", () => {
  it("approveExpense rejects a terminal (non-draft, non-approved) status", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "rejected" })
    const res = await actions.approveExpense(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Expense hanya bisa di-approve dari status draft/i)
  })

  it("approveExpense accepts an already-approved expense so petty cash still syncs", async () => {
    // A configured approval workflow flips status to "approved" but never runs
    // domain side effects; approveExpense must still sync petty cash.
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved" })
    const res = await actions.approveExpense(1)
    expect(res.success).toBe(true)
  })

  it("rejectExpense flips a draft expense to rejected", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.rejectExpense(1)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, status: { in: ["draft", "pending"] } },
        data: { status: "rejected" },
      }),
    )
  })

  it("rejectExpense is idempotent for an already-rejected expense", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "rejected" })
    const res = await actions.rejectExpense(1)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.expense.updateMany).not.toHaveBeenCalled()
  })

  it("rejectExpense refuses to reject an approved expense", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved" })
    const res = await actions.rejectExpense(1)
    expect(res.success).toBe(false)
  })

  it("markExpensePaid rejects non-approved status", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.markExpensePaid(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Hanya pengeluaran yang sudah disetujui/i)
  })

  it("matchReconciliationLine rejects non-draft reconciliation", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ status: "completed" })
    const res = await actions.matchReconciliationLine(1, 1, 1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Hanya rekonsiliasi dengan status draft/i)
  })

  it("completeReconciliation rejects non-draft status", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed", items: [] })
    const res = await actions.completeReconciliation(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Hanya rekonsiliasi dengan status draft/i)
  })

  it("postJournal rejects non-DRAFT status", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED", entries: [] })
    const res = await actions.postJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Journal hanya bisa di-post dari status DRAFT/i)
  })
})

describe("Journal validation edge cases", () => {
  it("createJournal rejects fewer than 2 valid entries", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }])
    })
    const res = await actions.createJournal(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/minimal 2 entri/i)
  })

  it("createJournal rejects unbalanced entries", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }, { accountId: 2, debit: 0, credit: 50 }])
    })
    const res = await actions.createJournal(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/tidak balance/i)
  })

  it("createJournal rejects negative debit/credit", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([{ accountId: 1, debit: -100, credit: 100 }, { accountId: 2, debit: 100, credit: -100 }])
    })
    const res = await actions.createJournal(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/tidak boleh negatif/i)
  })

  it("createJournal rejects both debit and credit on same line", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([{ accountId: 1, debit: 50, credit: 50 }, { accountId: 2, debit: 50, credit: 50 }])
    })
    const res = await actions.createJournal(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Satu baris tidak boleh memiliki debit dan credit sekaligus/i)
  })

  it("createJournal handles parse failure of entries JSON", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: "{not valid json"
    })
    const res = await actions.createJournal(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/minimal 2 entri/i)
  })

  it("updateJournal rejects fewer than 2 valid entries", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", transactionDate: new Date("2024-01-01") })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }])
    })
    const res = await actions.updateJournal(1, fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/minimal 2 entri/i)
  })

  it("updateJournal rejects unbalanced entries", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", transactionDate: new Date("2024-01-01") })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }, { accountId: 2, debit: 0, credit: 50 }])
    })
    const res = await actions.updateJournal(1, fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/tidak balance/i)
  })
})

describe("Petty Cash & Reconciliation edge cases", () => {
  it("createPettyCash rejects OUT exceeding balance", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findFirst.mockResolvedValue({ balanceAfter: 50 })
    const fd = fdMap({ type: "OUT", amount: 200, date: "2024-01-01" })
    const res = await actions.createPettyCash(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Saldo kas kecil tidak cukup/i)
  })

  it("recalcPettyCashChain updates balances (triggers tx.pettyCash.update)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findFirst.mockResolvedValue(null)
    mocks.prismaMock.pettyCash.findMany.mockResolvedValue([
      { id: 1, documentNo: "PC-01", type: "IN", amount: 100, balanceBefore: 0, balanceAfter: 50 }
    ])
    vi.mocked(computePettyCashChain).mockReturnValueOnce([
      { id: 1, balanceBefore: 0, balanceAfter: 100 }
    ] as any)
    mocks.prismaMock.pettyCash.update.mockResolvedValue({ id: 1 })
    const fd = fdMap({ type: "IN", amount: 100, date: "2024-01-01" })
    const res = await actions.createPettyCash(fd)
    expect(res.success).toBe(true)
  })

  it("createBankReconciliation validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    const res = await actions.createBankReconciliation(new FormData())
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Validasi gagal/i)
  })

  it("reverseJournal surfaces tx failure when the journal row is missing", async () => {
    // findUniqueOrThrow inside the tx rejects → action surfaces the failure.
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockRejectedValueOnce(new Error("No Journal found"))
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/No Journal found/i)
  })

  it("recalcPettyCashChain negative balance error covers full message", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findFirst.mockResolvedValue(null)
    mocks.prismaMock.pettyCash.findMany.mockResolvedValue([
      { id: 1, documentNo: "PC-01", type: "OUT", amount: 100, balanceBefore: 0, balanceAfter: -100 }
    ])
    vi.mocked(findFirstNegativeBalance).mockReturnValueOnce({
      record: { id: 1, documentNo: "PC-01" },
      balanceAfter: -100
    } as any)
    const fd = fdMap({ type: "IN", amount: 50, date: "2024-01-01" })
    const res = await actions.createPettyCash(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Saldo kas kecil menjadi negatif/i)
    expect(res.error).toMatch(/Periksa urutan tanggal/i)
  })

  it("recalcPettyCashChain negative balance with null documentNo", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.pettyCash.findFirst.mockResolvedValue(null)
    mocks.prismaMock.pettyCash.findMany.mockResolvedValue([
      { id: 99, documentNo: null, type: "OUT", amount: 50, balanceBefore: 0, balanceAfter: -50 }
    ])
    vi.mocked(findFirstNegativeBalance).mockReturnValueOnce({
      record: { id: 99, documentNo: null },
      balanceAfter: -50
    } as any)
    const fd = fdMap({ type: "IN", amount: 50, date: "2024-01-01" })
    const res = await actions.createPettyCash(fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/#99/)
  })

  it("updateJournal rejects non-DRAFT status", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED", transactionDate: new Date("2024-01-01") })
    const fd = fdMap({
      transactionDate: "2024-01-01",
      entries: JSON.stringify([{ accountId: 1, debit: 100, credit: 0 }, { accountId: 2, debit: 0, credit: 100 }])
    })
    const res = await actions.updateJournal(1, fd)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Journal yang sudah diposting tidak dapat diubah/i)
  })
})

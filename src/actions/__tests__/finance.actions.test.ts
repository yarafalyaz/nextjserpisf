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
    pettyCash: buildModelMock(),
    bankReconciliation: buildModelMock(),
    bankReconciliationLine: buildModelMock(),
    budget: buildModelMock(),
    costCenter: buildModelMock(),
    statisticalKeyFigure: buildModelMock(),
    account: buildModelMock(),
    accountingPeriod: buildModelMock(),
    transactionAttachment: buildModelMock(),
    bankReconciliationItem: buildModelMock(),
    user: buildModelMock(),
    
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
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
vi.mock("@/lib/finance/pettycash-posting", () => ({
  postPettyCashToGL: vi.fn().mockResolvedValue({}),
  reversePettyCashFromGL: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onExpenseApproved: vi.fn().mockResolvedValue({}),
  onPettyCashCreated: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/expense.hook", () => ({
  onExpenseApprovedSyncPettyCash: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/finance/petty-cash-chain", () => ({
  computePettyCashChain: vi.fn().mockReturnValue([]),
  findFirstNegativeBalance: vi.fn().mockReturnValue(null),
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue({}),
  assertApproved: vi.fn().mockResolvedValue({}),
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
  mocks.generateDocNumMock.mockResolvedValue("DOC-001")
  vi.mocked(findFirstNegativeBalance).mockReset().mockReturnValue(null)
  vi.mocked(computePettyCashChain).mockReset().mockReturnValue([])
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
  it("updateJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", entries: [{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }] })
    const res = await (actions as any).updateJournal(1, fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }])
    }))
    expect(res?.success).toBe(true)
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
  it("updateExpense succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions as any).updateExpense(1, fdMap({
      accountId: 1,
      amount: 1200,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("approveExpense succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions as any).approveExpense(1)
    expect(res?.success).toBe(true)
  })
  it("markExpensePaid succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved" })
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
  it("updatePettyCash succeeds", async () => {
    const res = await (actions as any).updatePettyCash(1, fdMap({
      type: "OUT",
      amount: 500,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("deletePettyCash succeeds", async () => {
    const res = await (actions as any).deletePettyCash(1)
    expect(res?.success).toBe(true)
  })
})

describe("Bank Reconciliation Actions", () => {
  it("createBankReconciliation succeeds", async () => {
    const res = await (actions as any).createBankReconciliation(fdMap({
      accountId: 1,
      statementDate: "2026-06-13",
      statementBalance: 5000
    }))
    expect(res?.success).toBe(true)
  })
  it("matchReconciliationLine succeeds", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await (actions.matchReconciliationLine as any)(1, 1, 1)
    expect(res?.success).toBe(true)
  })
  it("completeReconciliation succeeds", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await (actions as any).completeReconciliation(1)
    expect(res?.success).toBe(true)
  })
})

describe("Budget Actions", () => {
  it("createBudget succeeds", async () => {
    const res = await (actions as any).createBudget(fdMap({
      name: "Budget 2026",
      accountId: 1,
      amount: 100000,
      startDate: "2026-01-01",
      endDate: "2026-12-31"
    }))
    expect(res?.success).toBe(true)
  })
  it("updateBudget succeeds", async () => {
    mocks.prismaMock.budget.findUniqueOrThrow.mockResolvedValue({ id: 1 })
    const res = await (actions as any).updateBudget(1, fdMap({
      name: "Budget 2026 v2",
      accountId: 1,
      amount: 120000,
      startDate: "2026-01-01",
      endDate: "2026-12-31"
    }))
    expect(res?.success).toBe(true)
  })
  it("deleteBudget succeeds", async () => {
    const res = await (actions as any).deleteBudget(1)
    expect(res?.success).toBe(true)
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
})

describe("Statistical Key Figure Actions", () => {
  it("deleteStatisticalKeyFigure succeeds", async () => {
    const res = await (actions as any).deleteStatisticalKeyFigure(1)
    expect(res?.success).toBe(true)
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
  it("createBudget handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.budget.create.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).createBudget(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("updateBudget handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.budget.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).updateBudget(1, fdMap({}))
    expect(res?.success).toBe(false)
    expect(res?.error).toBeDefined()
  })
  it("deleteBudget handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.budget.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).deleteBudget(1)
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
  it("deleteStatisticalKeyFigure handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.statisticalKeyFigure.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await (actions as any).deleteStatisticalKeyFigure(1)
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
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED" })
    mocks.prismaMock.journal.updateMany.mockResolvedValueOnce({ count: 1 })
    mocks.prismaMock.$transaction.mockImplementationOnce(async () => { throw new Error("Tx fail") })
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.journal.updateMany).toHaveBeenCalledTimes(2)
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

  it("createBudget validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.createBudget(new FormData())).success).toBe(false)
  })

  it("updateBudget validation error", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    expect((await actions.updateBudget(1, new FormData())).success).toBe(false)
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

  it("updatePettyCash covers attachment update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
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

  it("deletePettyCash deletes existing journals", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findMany.mockResolvedValue([{ id: 100 }])
    mocks.prismaMock.pettyCash.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", documentNo: "PC-01" })
    const res = await actions.deletePettyCash(1)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.journalEntry.deleteMany).toHaveBeenCalled()
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

  it("reverseJournal concurrent claim rejection (REVERSED)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED" })
    mocks.prismaMock.journal.updateMany.mockResolvedValueOnce({ count: 0 })
    mocks.prismaMock.journal.findUnique.mockResolvedValue({ status: "REVERSED" })
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Jurnal sudah pernah dibalik/i)
  })

  it("reverseJournal concurrent claim rejection (DRAFT)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED" })
    mocks.prismaMock.journal.updateMany.mockResolvedValueOnce({ count: 0 })
    mocks.prismaMock.journal.findUnique.mockResolvedValue({ status: "DRAFT" })
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Jurnal tidak bisa dibalik/i)
  })

  it("matchReconciliationLine existing item update", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ status: "draft" })
    mocks.prismaMock.bankReconciliationItem.findFirst.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliationItem.update.mockResolvedValue({ id: 1 })
    const res = await actions.matchReconciliationLine(1, 1, 1)
    expect(res.success).toBe(true)
    expect(mocks.prismaMock.bankReconciliationItem.update).toHaveBeenCalled()
  })

  it("completeReconciliation unmatched items rejection", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", items: [{ matched: false }]
    })
    const res = await actions.completeReconciliation(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Semua baris harus di-match/i)
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
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT" })
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Hanya journal yang sudah POSTED yang bisa di-reverse/i)
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
    { name: "createBudget", fn: () => actions.createBudget(new FormData()) },
    { name: "createCostCenter", fn: () => actions.createCostCenter(new FormData()) },
    { name: "updateCostCenter", fn: () => actions.updateCostCenter(1, new FormData()) },
    { name: "deleteJournal", fn: () => actions.deleteJournal(1) },
    { name: "deleteExpense", fn: () => actions.deleteExpense(1) },
    { name: "deletePettyCash", fn: () => actions.deletePettyCash(1) },
    { name: "deleteBudget", fn: () => actions.deleteBudget(1) },
    { name: "deleteCostCenter", fn: () => actions.deleteCostCenter(1) },
    { name: "deleteStatisticalKeyFigure", fn: () => actions.deleteStatisticalKeyFigure(1) },
    { name: "updateJournal", fn: () => actions.updateJournal(1, new FormData()) },
    { name: "reverseJournal", fn: () => actions.reverseJournal(1) },
    { name: "updateExpense", fn: () => actions.updateExpense(1, new FormData()) },
    { name: "updatePettyCash", fn: () => actions.updatePettyCash(1, new FormData()) },
    { name: "updateBudget", fn: () => actions.updateBudget(1, new FormData()) },
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
  it("approveExpense rejects non-draft status", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved" })
    const res = await actions.approveExpense(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Expense hanya bisa di-approve dari status draft/i)
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

  it("reverseJournal findUnique returns null (not found)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED" })
    mocks.prismaMock.journal.updateMany.mockResolvedValueOnce({ count: 0 })
    mocks.prismaMock.journal.findUnique.mockResolvedValue(null)
    const res = await actions.reverseJournal(1)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Jurnal tidak ditemukan/i)
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

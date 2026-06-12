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
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
  mocks.generateDocNumMock.mockResolvedValue("DOC-001")
})

describe("Bank Statement Actions", () => {
  it("createBankStatement succeeds", async () => {
    const res = await actions.createBankStatement(fdMap({
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
    const res = await actions.createJournal(fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }])
    }))
    expect(res?.success).toBe(true)
  })
  it("updateJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", entries: [{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }] })
    const res = await actions.updateJournal(1, fdMap({
      transactionDate: "2026-06-13",
      entries: JSON.stringify([{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }])
    }))
    expect(res?.success).toBe(true)
  })
  it("postJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT", entries: [{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }] })
    const res = await actions.postJournal(1)
    expect(res?.success).toBe(true)
  })
  it("reverseJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "POSTED", isReversed: false, entries: [{ accountId: 1, debit: 1000, credit: 0 }, { accountId: 2, debit: 0, credit: 1000 }] })
    const res = await actions.reverseJournal(1)
    expect(res?.success).toBe(true)
  })
  it("deleteJournal succeeds", async () => {
    mocks.prismaMock.journal.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "DRAFT" })
    const res = await actions.deleteJournal(1)
    expect(res?.success).toBe(true)
  })
})

describe("Expense Actions", () => {
  it("createExpense succeeds", async () => {
    const res = await actions.createExpense(fdMap({
      accountId: 1,
      amount: 1000,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("updateExpense succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateExpense(1, fdMap({
      accountId: 1,
      amount: 1200,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("approveExpense succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.approveExpense(1)
    expect(res?.success).toBe(true)
  })
  it("markExpensePaid succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved" })
    const res = await actions.markExpensePaid(1)
    expect(res?.success).toBe(true)
  })
  it("deleteExpense succeeds", async () => {
    mocks.prismaMock.expense.findUniqueOrThrow.mockResolvedValue({ id: 1, isPosted: false })
    const res = await actions.deleteExpense(1)
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
    const res = await actions.createPettyCash(fdMap({
      type: "IN",
      amount: 1000,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("updatePettyCash succeeds", async () => {
    const res = await actions.updatePettyCash(1, fdMap({
      type: "OUT",
      amount: 500,
      date: "2026-06-13"
    }))
    expect(res?.success).toBe(true)
  })
  it("deletePettyCash succeeds", async () => {
    const res = await actions.deletePettyCash(1)
    expect(res?.success).toBe(true)
  })
})

describe("Bank Reconciliation Actions", () => {
  it("createBankReconciliation succeeds", async () => {
    const res = await actions.createBankReconciliation(fdMap({
      accountId: 1,
      statementDate: "2026-06-13",
      statementBalance: 5000
    }))
    expect(res?.success).toBe(true)
  })
  it("matchReconciliationLine succeeds", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.matchReconciliationLine(1, 1, 1)
    expect(res?.success).toBe(true)
  })
  it("completeReconciliation succeeds", async () => {
    mocks.prismaMock.bankReconciliation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.completeReconciliation(1)
    expect(res?.success).toBe(true)
  })
})

describe("Budget Actions", () => {
  it("createBudget succeeds", async () => {
    const res = await actions.createBudget(fdMap({
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
    const res = await actions.updateBudget(1, fdMap({
      name: "Budget 2026 v2",
      accountId: 1,
      amount: 120000,
      startDate: "2026-01-01",
      endDate: "2026-12-31"
    }))
    expect(res?.success).toBe(true)
  })
  it("deleteBudget succeeds", async () => {
    const res = await actions.deleteBudget(1)
    expect(res?.success).toBe(true)
  })
})

describe("Cost Center Actions", () => {
  it("createCostCenter succeeds", async () => {
    const res = await actions.createCostCenter(fdMap({
      code: "CC-001",
      name: "Cost Center 1",
      isActive: "true"
    }))
    expect(res?.success).toBe(true)
  })
  it("updateCostCenter succeeds", async () => {
    mocks.prismaMock.costCenter.findUniqueOrThrow.mockResolvedValue({ id: 1 })
    const res = await actions.updateCostCenter(1, fdMap({
      code: "CC-001",
      name: "Cost Center 1 Updated"
    }))
    expect(res?.success).toBe(true)
  })
  it("deleteCostCenter succeeds", async () => {
    const res = await actions.deleteCostCenter(1)
    expect(res?.success).toBe(true)
  })
})

describe("Statistical Key Figure Actions", () => {
  it("deleteStatisticalKeyFigure succeeds", async () => {
    const res = await actions.deleteStatisticalKeyFigure(1)
    expect(res?.success).toBe(true)
  })
})

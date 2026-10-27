import { describe, it, expect, vi, beforeEach } from "vitest"

import {
  financeAccountingHookFactory,
  financeActivityLogFactory,
  financeExpenseHookFactory,
  financeJournalPrismaFactory,
  financeNextCacheFactory,
  financePeriodLockFactory,
  financePermissionsFactory,
} from "./finance-lock-fixtures"

// Regression test for the journal double-entry decimal precision bug.
// The action layer (createJournal / updateJournal) computes the balance
// check with safeAdd(..., 0) — i.e. rounding each line to whole IDR.
// When the journal schema is Decimal(15,2), two-decimal fractional
// amounts round to 0 at every step of the reduce, so a journal with
// debit 0.40+0.40=0.80 and credit 0.20+0.20=0.40 (clearly unbalanced
// at 2 decimals) is accepted as "balanced" because both totals round
// to 0. This violates double-entry integrity: an unbalanced journal is
// persisted to the database.
//
// The fix is to use 2 decimals for the balance check so it matches
// the Decimal(15,2) precision the DB enforces.

const holder = vi.hoisted(() => ({ set: null as any, include: {
  requirePermissionMock: true, revalidateMock: true, logActivityMock: true,
  assertPeriodOpenMock: true, generateDocumentNumberMock: true,
  journalFindUniqueOrThrowMock: true, journalUpdateMock: true,
  journalCreateMock: true, entryCreateManyMock: true, entryDeleteManyMock: true,
  attachmentUpdateManyMock: true, transactionMock: true,
} }))
let requirePermissionMock: any
let revalidateMock: any
let logActivityMock: any
let assertPeriodOpenMock: any
let generateDocumentNumberMock: any
let journalFindUniqueOrThrowMock: any
let journalUpdateMock: any
let journalCreateMock: any
let entryCreateManyMock: any
let entryDeleteManyMock: any
let attachmentUpdateManyMock: any
let transactionMock: any

const approvalMocks = vi.hoisted(() => ({
  assertApprovedMock: vi.fn(async () => undefined),
  requestApprovalMock: vi.fn(async () => false),
}))

vi.mock("@/lib/auth/permissions", () => financePermissionsFactory(holder))
vi.mock("@/lib/db/prisma", () => financeJournalPrismaFactory(holder))
vi.mock("@/lib/services/period-lock.service", () => financePeriodLockFactory(holder))
vi.mock("@/lib/services/activity-log.service", () => financeActivityLogFactory(holder))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: (...a: unknown[]) => approvalMocks.assertApprovedMock(...(a as [])),
  requestApprovalIfConfigured: (...a: unknown[]) => approvalMocks.requestApprovalMock(...(a as [])),
}))
vi.mock("@/lib/hooks/accounting.hook", () => financeAccountingHookFactory())
vi.mock("@/lib/hooks/expense.hook", () => financeExpenseHookFactory())
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocumentNumberMock(...a),
}))
vi.mock("next/cache", () => financeNextCacheFactory(holder))

import { createJournal, updateJournal, postJournal } from "../finance.actions"

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

function wireCreateTx() {
  const tx = {
    journal: { create: journalCreateMock },
    journalEntry: { createMany: entryCreateManyMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

function wireUpdateTx() {
  const tx = {
    journal: { update: journalUpdateMock },
    journalEntry: { createMany: entryCreateManyMock, deleteMany: entryDeleteManyMock },
  }
  transactionMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
}

beforeEach(() => {
  ;({ requirePermissionMock, revalidateMock, logActivityMock, assertPeriodOpenMock, generateDocumentNumberMock, journalFindUniqueOrThrowMock, journalUpdateMock, journalCreateMock, entryCreateManyMock, entryDeleteManyMock, attachmentUpdateManyMock, transactionMock } = holder.set)
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock, assertPeriodOpenMock,
    generateDocumentNumberMock, journalFindUniqueOrThrowMock, journalUpdateMock,
    journalCreateMock, entryCreateManyMock, entryDeleteManyMock,
    attachmentUpdateManyMock, transactionMock,
  ]) m.mockReset()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  assertPeriodOpenMock.mockResolvedValue(undefined)
  generateDocumentNumberMock.mockResolvedValue("JRN-0001")
  journalCreateMock.mockResolvedValue({ id: 11 })
  journalUpdateMock.mockResolvedValue({ id: 11 })
  entryCreateManyMock.mockResolvedValue({ count: 2 })
  entryDeleteManyMock.mockResolvedValue({ count: 2 })
  journalFindUniqueOrThrowMock.mockResolvedValue({
    id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
  })
})

describe("journal balance check honors Decimal(15,2) precision", () => {
  it("createJournal rejects fractional-decimal entries whose 2-decimal sums differ (drift at 0 decimals)", async () => {
    // debit 0.40 + 0.40 = 0.80 ; credit 0.20 + 0.20 = 0.40. Clearly unbalanced
    // at 2 decimals (0.80 != 0.40). With safeAdd(..., 0) both totals round to
    // 0 and the journal is wrongly accepted. The fix uses 2 decimals.
    wireCreateTx()
    const unbalanced = JSON.stringify([
      { accountId: 100, debit: 0.40, credit: 0, memo: "" },
      { accountId: 200, debit: 0.40, credit: 0, memo: "" },
      { accountId: 300, debit: 0, credit: 0.20, memo: "" },
      { accountId: 400, debit: 0, credit: 0.20, memo: "" },
    ])
    const result = await createJournal(fd({ transactionDate: "2026-06-02", entries: unbalanced }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("updateJournal rejects the same fractional-decimal drift as createJournal", async () => {
    wireUpdateTx()
    const unbalanced = JSON.stringify([
      { accountId: 100, debit: 0.40, credit: 0, memo: "" },
      { accountId: 200, debit: 0.40, credit: 0, memo: "" },
      { accountId: 300, debit: 0, credit: 0.20, memo: "" },
      { accountId: 400, debit: 0, credit: 0.20, memo: "" },
    ])
    const result = await updateJournal(7, fd({ transactionDate: "2026-06-02", entries: unbalanced }))
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("K4-S1: postJournal menolak jurnal tak seimbang tepat 1 sen (100.00 vs 99.99)", async () => {
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
      entries: [
        { debit: 100.0, credit: 0 },
        { debit: 0, credit: 99.99 },
      ],
    })

    const result = await postJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("K4-S1: postJournal ditolak saat workflow Journal aktif tapi approval belum approved", async () => {
    approvalMocks.assertApprovedMock.mockRejectedValueOnce(
      new Error("Dokumen masih menunggu persetujuan (approval workflow) sebelum dapat dilanjutkan."),
    )
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
      entries: [
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ],
    })

    const result = await postJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("menunggu persetujuan")
    expect(approvalMocks.assertApprovedMock).toHaveBeenCalledWith("Journal", 7)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it("postJournal also rejects a draft whose 2-decimal entries are unbalanced", async () => {
    // Imagine a draft was somehow saved with unbalanced decimals (e.g. via a
    // previous createJournal bug). postJournal must NOT promote it to POSTED
    // — but the existing safeAdd(..., 0) reduce masks the imbalance.
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
      entries: [
        { debit: 0.40, credit: 0 },
        { debit: 0.40, credit: 0 },
        { debit: 0, credit: 0.20 },
        { debit: 0, credit: 0.20 },
      ],
    })

    const result = await postJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(journalUpdateMock).not.toHaveBeenCalled()
  })

  it("K4-S1 (F-2026-10-25-014-V): postJournal menolak selisih tepat 1 sen (toleransi nol)", async () => {
    // Debit 100.00 vs kredit 99.99 — selisih 0,01 rupiah. Toleransi apa
    // pun >= 0,01 akan meloloskan jurnal ini ke GL; vonis Accountant
    // mewajibkan toleransi nol. Cabut/longgarkan compareAmounts(..., 0)
    // di postJournal -> tes ini MERAH.
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 7, status: "DRAFT", transactionDate: new Date("2026-06-01"),
      entries: [
        { debit: 100, credit: 0 },
        { debit: 0, credit: 99.99 },
      ],
    })

    const result = await postJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("tidak balance")
    expect(journalUpdateMock).not.toHaveBeenCalled()
  })
})

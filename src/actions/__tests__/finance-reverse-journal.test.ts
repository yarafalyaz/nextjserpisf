import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock permissions + prisma + services
const requirePermissionMock = vi.fn()
const logActivityMock = vi.fn()
const revalidatePathMock = vi.fn()
const assertPeriodOpenMock = vi.fn()
const generateDocumentNumberMock = vi.fn()

const journalFindUniqueOrThrowMock = vi.fn()
const journalFindUniqueMock = vi.fn()
const journalUpdateManyMock = vi.fn()
const journalUpdateMock = vi.fn()
const journalCreateMock = vi.fn()
const entryCreateManyMock = vi.fn()
const entryFindManyMock = vi.fn()
const reconItemFindFirstMock = vi.fn()
const transactionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journal: {
      findUniqueOrThrow: (...a: unknown[]) => journalFindUniqueOrThrowMock(...a),
      findUnique: (...a: unknown[]) => journalFindUniqueMock(...a),
      updateMany: (...a: unknown[]) => journalUpdateManyMock(...a),
      update: (...a: unknown[]) => journalUpdateMock(...a),
      create: (...a: unknown[]) => journalCreateMock(...a),
    },
    journalEntry: {
      createMany: (...a: unknown[]) => entryCreateManyMock(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocumentNumberMock(...a),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}))

import { reverseJournal } from "../finance.actions"

beforeEach(() => {
  for (const m of [
    requirePermissionMock,
    logActivityMock,
    revalidatePathMock,
    assertPeriodOpenMock,
    generateDocumentNumberMock,
    journalFindUniqueOrThrowMock,
    journalFindUniqueMock,
    journalUpdateManyMock,
    journalUpdateMock,
    journalCreateMock,
    entryCreateManyMock,
    entryFindManyMock,
    reconItemFindFirstMock,
    transactionMock,
  ]) m.mockReset()

  requirePermissionMock.mockResolvedValue({ id: 1 })
  assertPeriodOpenMock.mockResolvedValue(undefined)
  generateDocumentNumberMock.mockResolvedValue("JRN-RV-0001")
  journalFindUniqueOrThrowMock.mockResolvedValue({
    id: 7,
    status: "POSTED",
    transactionDate: new Date("2026-06-15"),
    journalNumber: "JRN-202606-00007",
    description: "Sale",
    type: "GENERAL",
    totalDebit: 1000,
    totalCredit: 1000,
    entries: [
      { accountId: 100, debit: 1000, credit: 0, memo: "kas", costCenterId: null, profitCenterId: null },
      { accountId: 200, debit: 0, credit: 1000, memo: "modal", costCenterId: null, profitCenterId: null },
    ],
  })
  // claim succeeds
  journalUpdateManyMock.mockResolvedValue({ count: 1 })
  // wire transaction: lock → re-read → claim → reversal, all inside one tx.
  // The outer prisma.journal mocks double as the in-tx client (same pattern
  // as finance.actions.test.ts, whose $transaction passes prismaMock itself).
  const txClient = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    journal: {
      findUniqueOrThrow: journalFindUniqueOrThrowMock,
      updateMany: journalUpdateManyMock,
      update: journalUpdateMock,
      create: journalCreateMock,
    },
    journalEntry: { createMany: entryCreateManyMock, findMany: entryFindManyMock },
    bankReconciliationItem: { findFirst: reconItemFindFirstMock },
  }
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txClient))
  journalCreateMock.mockResolvedValue({ id: 99 })
  journalUpdateMock.mockResolvedValue({ id: 7 })
  entryCreateManyMock.mockResolvedValue({ count: 2 })
  entryFindManyMock.mockResolvedValue([{ id: 500 }])
  reconItemFindFirstMock.mockResolvedValue(null)
})

describe("reverseJournal", () => {
  it("reverses a POSTED journal and flips status to REVERSED", async () => {
    const result = await reverseJournal(7)
    expect(result.success).toBe(true)
    expect(journalCreateMock).toHaveBeenCalled()
    expect(journalUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: { status: "REVERSED" },
      })
    )
  })

  it("dates the reversal journal to the ORIGINAL transactionDate (so period reports net to zero)", async () => {
    const originalDate = new Date("2026-06-15")
    await reverseJournal(7)

    const created = journalCreateMock.mock.calls[0][0] as {
      data: { transactionDate: Date; status: string; referenceId: number }
    }
    // Same period as the original → the (REVERSED original + reversal) pair
    // stays inside one period; a period P&L for June nets to zero and July is
    // not polluted by a reversal of a June journal.
    expect(created.data.transactionDate).toEqual(originalDate)
    expect(created.data.status).toBe("POSTED")
    expect(created.data.referenceId).toBe(7)
  })

  it("putaran 86: menolak reversal jurnal pada rekonsiliasi completed", async () => {
    reconItemFindFirstMock.mockResolvedValue({ id: 42 })

    const result = await reverseJournal(7)

    expect(result.success).toBe(false)
    expect(String(result.error)).toContain("rekonsiliasi bank final")
    expect(journalCreateMock).not.toHaveBeenCalled()
    expect(reconItemFindFirstMock).toHaveBeenCalledWith({
      where: {
        journalEntryId: { in: [500] },
        matched: true,
        bankReconciliation: { status: "completed" },
      },
      select: { id: true },
    })
  })

  it("TASK-025: menolak reversal atas jurnal reversal (referenceType Journal), nol jurnal ditulis", async () => {
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 99,
      status: "POSTED",
      referenceType: "Journal",
      referenceId: 7,
      transactionDate: new Date("2026-06-15"),
      journalNumber: "JRN-RV-0001",
      description: "Reversal of JRN-202606-00007",
      type: "GENERAL",
      totalDebit: 1000,
      totalCredit: 1000,
      entries: [
        { accountId: 100, debit: 0, credit: 1000, memo: "kas", costCenterId: null, profitCenterId: null },
        { accountId: 200, debit: 1000, credit: 0, memo: "modal", costCenterId: null, profitCenterId: null },
      ],
    })

    const result = await reverseJournal(99)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Jurnal reversal tidak boleh di-reverse lagi")
    expect(journalCreateMock).not.toHaveBeenCalled()
    expect(journalUpdateManyMock).not.toHaveBeenCalled()
    expect(journalUpdateMock).not.toHaveBeenCalled()
  })

  it("regresi putaran 47: menolak reversal generik jurnal siklus aset (perolehan), nol jurnal ditulis", async () => {
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 55,
      status: "POSTED",
      referenceType: "ASSET_ACQUISITION",
      referenceId: 42,
      transactionDate: new Date("2026-06-15"),
      journalNumber: "JRN-202606-00055",
      description: "Perolehan aset: Mesin (AST-01)",
      type: "ASSET_ACQUISITION",
      totalDebit: 1000,
      totalCredit: 1000,
      entries: [
        { accountId: 100, debit: 1000, credit: 0, memo: "aset", costCenterId: null, profitCenterId: null },
        { accountId: 200, debit: 0, credit: 1000, memo: "kas", costCenterId: null, profitCenterId: null },
      ],
    })

    const result = await reverseJournal(55)
    expect(result.success).toBe(false)
    expect(result.error).toContain("siklus aset")
    expect(journalCreateMock).not.toHaveBeenCalled()
    expect(journalUpdateManyMock).not.toHaveBeenCalled()
    expect(journalUpdateMock).not.toHaveBeenCalled()
  })

  it("regresi putaran 47: menolak reversal generik jurnal penyusutan masa (ASSET_DEPRECIATION_YYYYMM)", async () => {
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 56,
      status: "POSTED",
      referenceType: "ASSET_DEPRECIATION_202606",
      referenceId: 42,
      transactionDate: new Date("2026-06-01"),
      journalNumber: "JRN-202606-00056",
      description: "Penyusutan aset: Mesin (AST-01) - 6/2026",
      type: "DEPRECIATION",
      totalDebit: 100,
      totalCredit: 100,
      entries: [
        { accountId: 300, debit: 100, credit: 0, memo: "beban", costCenterId: null, profitCenterId: null },
        { accountId: 301, debit: 0, credit: 100, memo: "akumulasi", costCenterId: null, profitCenterId: null },
      ],
    })

    const result = await reverseJournal(56)
    expect(result.success).toBe(false)
    expect(result.error).toContain("siklus aset")
    expect(journalCreateMock).not.toHaveBeenCalled()
    expect(journalUpdateManyMock).not.toHaveBeenCalled()
    expect(journalUpdateMock).not.toHaveBeenCalled()
  })

  // Putaran 117: jurnal alur produksi tidak boleh dibalik lewat jalur generik.
  // `onProductionCostAbsorbed` membangun ulang nilai jurnal dari SATU jurnal
  // aktif `ProductionCost` per baris biaya (lalu membalik dan menggantinya
  // dengan nilai KUMULATIF di kunci yang sama). Reversal generik menghapus
  // jurnal aktif itu dari pandangannya (`status: { not: "REVERSED" }`), jadi
  // `currentAmount` terbaca 0 dan hanya delta yang diposting: GL berhenti
  // mencerminkan `ProductionOrder.totalActualCost`, permanen. Jenis lain
  // (penyelesaian, pengeluaran bahan, scrap abnormal) dibaca laporan
  // POSTED-saja sehingga aslinya lenyap dari laporan tanpa lawannya.
  for (const referenceType of [
    "ProductionCost",
    "ProductionOrder",
    "ProductionOrder_321",
    "ProductionOrderCostVariance",
    "ProductionOrderCostVariance_321",
    "ProductionOrderMaterialIssue",
    "ProductionOrderAbnormalScrap",
    "MaterialIssue",
  ]) {
    it(`menolak reversal generik jurnal produksi (${referenceType}), nol jurnal ditulis`, async () => {
      journalFindUniqueOrThrowMock.mockResolvedValue({
        id: 70,
        status: "POSTED",
        referenceType,
        referenceId: 88,
        transactionDate: new Date("2026-06-15"),
        journalNumber: "JRN-202606-00070",
        description: "Jurnal produksi",
        type: "PROD",
        totalDebit: 500,
        totalCredit: 500,
        entries: [
          { accountId: 300, debit: 500, credit: 0, memo: "wip", costCenterId: null, profitCenterId: null },
          { accountId: 301, debit: 0, credit: 500, memo: "bahan", costCenterId: null, profitCenterId: null },
        ],
      })

      const result = await reverseJournal(70)
      expect(result.success).toBe(false)
      expect(result.error).toContain("produksi")
      expect(journalCreateMock).not.toHaveBeenCalled()
      expect(journalUpdateManyMock).not.toHaveBeenCalled()
      expect(journalUpdateMock).not.toHaveBeenCalled()
    })
  }

  it("jurnal non-produksi tetap bisa dibalik generik (kontrol positif)", async () => {
    journalFindUniqueOrThrowMock.mockResolvedValue({
      id: 71,
      status: "POSTED",
      referenceType: "PettyCash",
      referenceId: 5,
      transactionDate: new Date("2026-06-15"),
      journalNumber: "JRN-202606-00071",
      description: "Kas kecil",
      type: "GENERAL",
      totalDebit: 100,
      totalCredit: 100,
      entries: [
        { accountId: 100, debit: 100, credit: 0, memo: "beban", costCenterId: null, profitCenterId: null },
        { accountId: 200, debit: 0, credit: 100, memo: "kas", costCenterId: null, profitCenterId: null },
      ],
    })

    const result = await reverseJournal(71)
    expect(result.success).toBe(true)
    expect(journalCreateMock).toHaveBeenCalled()
  })

  it("rolls the tx back when the reversal body throws (atomic claim+reversal)", async () => {
    // The claim now lives INSIDE the same tx as the reversal: a tx failure
    // rolls both back atomically. No outer claim + compensating restore
    // exists anymore — the journal stays POSTED and retryable by rollback.
    // Make the inner tx throw
    transactionMock.mockImplementation(async () => {
      throw new Error("simulated tx failure")
    })

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("simulated tx failure")
    // Nothing committed: no reversal journal row
    expect(journalCreateMock).not.toHaveBeenCalled()
  })

  it("leaves the journal POSTED when the period is closed (atomic rollback, retryable)", async () => {
    // Simulate: an admin clicks Reverse on a journal whose transactionDate
    // belongs to a period that has since been closed. assertPeriodOpen throws
    // INSIDE the tx — the tx rolls back, the journal stays POSTED, retryable.
    assertPeriodOpenMock.mockRejectedValueOnce(
      new Error("Periode akuntansi sudah ditutup")
    )

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(result.error).toContain("ditutup")

    // The claim + reversal both rolled back: no reversal journal committed.
    expect(journalCreateMock).not.toHaveBeenCalled()
  })

  it("leaves the journal POSTED when generateDocumentNumber throws (atomic rollback)", async () => {
    // The sequence-generator failure also happens INSIDE the tx — rollback
    // keeps the journal POSTED and retryable, no compensating restore needed.
    generateDocumentNumberMock.mockRejectedValueOnce(new Error("seq boom"))

    const result = await reverseJournal(7)
    expect(result.success).toBe(false)
    expect(journalCreateMock).not.toHaveBeenCalled()
  })
})

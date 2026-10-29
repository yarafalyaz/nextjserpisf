import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for reverseJournalsByReferenceTx (P1-7): reversal keeps history.
// POSTED journals get a mirror entry (original → REVERSED); nothing is deleted.

const journalFindMany = vi.fn()
const journalFindFirst = vi.fn()
const journalCreate = vi.fn()
const journalUpdate = vi.fn()
const journalDelete = vi.fn()
const entryCreateMany = vi.fn()
const entryDeleteMany = vi.fn()
const periodOpen = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: unknown[]) => periodOpen(...a),
}))
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: () => Promise.resolve(42) },
}))

import { reverseJournalsByReferenceTx } from "@/lib/hooks/accounting.hook"

const tx = {
  journal: {
    findMany: (...a: unknown[]) => journalFindMany(...a),
    findFirst: (...a: unknown[]) => journalFindFirst(...a),
    create: (...a: unknown[]) => journalCreate(...a),
    update: (...a: unknown[]) => journalUpdate(...a),
    delete: (...a: unknown[]) => journalDelete(...a),
  },
  journalEntry: {
    createMany: (...a: unknown[]) => entryCreateMany(...a),
    deleteMany: (...a: unknown[]) => entryDeleteMany(...a),
  },
}

const POSTED = {
  id: 5,
  journalNumber: "INV/7/20260101",
  transactionDate: new Date("2026-03-01"),
  type: "GENERAL",
  status: "POSTED",
  totalDebit: 1000,
  totalCredit: 1000,
  entries: [
    { accountId: 1, debit: 1000, credit: 0, memo: "Piutang", costCenterId: null, profitCenterId: null },
    { accountId: 2, debit: 0, credit: 1000, memo: "Pendapatan", costCenterId: null, profitCenterId: null },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  journalFindMany.mockResolvedValue([])
  journalFindFirst.mockResolvedValue(null)
  journalCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...data, id: 77 }),
  )
  journalUpdate.mockResolvedValue({})
  journalDelete.mockResolvedValue({})
  entryCreateMany.mockResolvedValue({ count: 2 })
  entryDeleteMany.mockResolvedValue({ count: 0 })
  periodOpen.mockResolvedValue(undefined)
})

describe("reverseJournalsByReferenceTx (P1-7)", () => {
  it("creates a mirror entry and marks the original REVERSED", async () => {
    journalFindMany.mockResolvedValue([POSTED])

    await reverseJournalsByReferenceTx(tx as never, "SalesInvoice", 7, "void/edit faktur #7", 1)

    // Reversal dated to the ORIGINAL period, not today.
    expect(journalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceType: "Journal",
          referenceId: 5,
          status: "POSTED",
          totalDebit: 1000,
          totalCredit: 1000,
          transactionDate: POSTED.transactionDate,
        }),
      }),
    )
    // Mirror: debit <-> credit.
    expect(entryCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ journalId: 77, accountId: 1, debit: 0, credit: 1000 }),
        expect.objectContaining({ journalId: 77, accountId: 2, debit: 1000, credit: 0 }),
      ],
    })
    expect(journalUpdate).toHaveBeenCalledWith({ where: { id: 5 }, data: { status: "REVERSED" } })
    // Nothing deleted.
    expect(journalDelete).not.toHaveBeenCalled()
    expect(entryDeleteMany).not.toHaveBeenCalled()
  })

  it("is idempotent: skips journals that already have a reversal", async () => {
    journalFindMany.mockResolvedValue([POSTED])
    journalFindFirst.mockResolvedValue({ id: 77 })

    await reverseJournalsByReferenceTx(tx as never, "SalesInvoice", 7, "r", null)

    expect(journalCreate).not.toHaveBeenCalled()
    expect(journalUpdate).not.toHaveBeenCalled()
  })

  it("refuses reversal when the original period is locked", async () => {
    journalFindMany.mockResolvedValue([POSTED])
    periodOpen.mockRejectedValue(new Error("Periode terkunci"))

    await expect(
      reverseJournalsByReferenceTx(tx as never, "SalesInvoice", 7, "r", null),
    ).rejects.toThrow(/terkunci/)
    expect(journalCreate).not.toHaveBeenCalled()
  })

  it("REVERSED journal is skipped, not deleted (counterpart must not be orphaned)", async () => {
    const REVERSED = { ...POSTED, status: "REVERSED" }
    journalFindMany.mockResolvedValue([REVERSED])
    // Even if the counterpart lookup would find the reversal, the status
    // branch alone must already skip — deleting the REVERSED original would
    // strand its POSTED counterpart as a one-sided GL balance.
    journalFindFirst.mockResolvedValue({ id: 77 })

    await reverseJournalsByReferenceTx(tx as never, "SalesInvoice", 7, "void lagi", 1)

    expect(journalCreate).not.toHaveBeenCalled()
    expect(journalUpdate).not.toHaveBeenCalled()
    expect(journalDelete).not.toHaveBeenCalled()
    expect(entryDeleteMany).not.toHaveBeenCalled()
  })

  it("REVERSED without a found counterpart is still skipped, not deleted", async () => {
    const REVERSED = { ...POSTED, status: "REVERSED" }
    journalFindMany.mockResolvedValue([REVERSED])
    journalFindFirst.mockResolvedValue(null)

    await reverseJournalsByReferenceTx(tx as never, "SalesInvoice", 7, "void lagi", 1)

    expect(journalCreate).not.toHaveBeenCalled()
    expect(journalDelete).not.toHaveBeenCalled()
    expect(entryDeleteMany).not.toHaveBeenCalled()
  })

  it("TASK-025: menolak dipanggil dengan referenceType Journal (reversal atas reversal), nol jurnal ditulis", async () => {
    await expect(
      reverseJournalsByReferenceTx(tx as never, "Journal", 5, "reverse atas reversal", 1),
    ).rejects.toThrow(/Jurnal reversal tidak boleh di-reverse lagi/)
    expect(journalFindMany).not.toHaveBeenCalled()
    expect(journalCreate).not.toHaveBeenCalled()
    expect(journalUpdate).not.toHaveBeenCalled()
  })

  it("DRAFT journal is still deleted (not yet in GL)", async () => {
    const DRAFT = { ...POSTED, status: "DRAFT" }
    journalFindMany.mockResolvedValue([DRAFT])

    await reverseJournalsByReferenceTx(tx as never, "SalesInvoice", 7, "edit draft", 1)

    expect(journalDelete).toHaveBeenCalledWith({ where: { id: 5 } })
    expect(entryDeleteMany).toHaveBeenCalledWith({ where: { journalId: 5 } })
    expect(journalCreate).not.toHaveBeenCalled()
  })
})

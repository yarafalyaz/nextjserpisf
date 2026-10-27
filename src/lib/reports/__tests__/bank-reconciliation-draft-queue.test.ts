import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  BANK_RECONCILIATION_DRAFT_LEVEL_LABELS,
  BANK_RECONCILIATION_DRAFT_NOTICE_TEXT,
  BANK_RECONCILIATION_DRAFT_STALE_DAYS,
  BANK_RECONCILIATION_DRAFT_TITLE,
  buildBankReconciliationDraftQueue,
  type BankReconciliationDraftInput,
} from "../bank-reconciliation-draft-queue"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  reconFindMany: vi.fn(),
  itemFindMany: vi.fn(),
  accountFindMany: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    bankReconciliation: { findMany: (...a: unknown[]) => mocks.reconFindMany(...a) },
    bankReconciliationItem: { findMany: (...a: unknown[]) => mocks.itemFindMany(...a) },
    account: { findMany: (...a: unknown[]) => mocks.accountFindMany(...a) },
  },
}))

import { getBankReconciliationDraftQueue } from "../bank-reconciliation-draft-queue-data"

// Baca "sekarang" tetap: 2026-10-27 05:00 UTC = 12:00 WIB.
const NOW = new Date("2026-10-27T05:00:00.000Z")

function input(over: Partial<BankReconciliationDraftInput> = {}): BankReconciliationDraftInput {
  return {
    reconciliationId: 1,
    slug: "rec-1",
    reconciliationNumber: "REC-001",
    status: "draft",
    deletedAt: null,
    accountId: 10,
    accountCode: "110201",
    accountName: "Bank BCA",
    statementDate: new Date("2026-10-25T00:00:00.000Z"),
    periodStart: null,
    periodEnd: null,
    statementBalance: 1500000,
    bookBalance: 1400000,
    createdAt: new Date("2026-10-26T05:00:00.000Z"),
    totalItemCount: 0,
    matchingItemCount: 0,
    matchedItemCount: 0,
    adjustmentItemCount: 0,
    ...over,
  }
}

describe("buildBankReconciliationDraftQueue", () => {
  it("konstanta putusan Lead: ambang 3, label dan judul verbatim", () => {
    expect(BANK_RECONCILIATION_DRAFT_STALE_DAYS).toBe(3)
    expect(BANK_RECONCILIATION_DRAFT_TITLE).toBe("Rekonsiliasi Bank Belum Selesai")
    expect(BANK_RECONCILIATION_DRAFT_LEVEL_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu",
    })
    expect(BANK_RECONCILIATION_DRAFT_NOTICE_TEXT).toContain("masih draft")
  })

  it("AC-RBK-B1: populasi persis draft + deletedAt null; completed/terhapus/status asing keluar", () => {
    const q = buildBankReconciliationDraftQueue(
      [
        input({ reconciliationId: 1 }),
        input({ reconciliationId: 2, status: "completed" }),
        input({ reconciliationId: 3, deletedAt: new Date("2026-10-26T00:00:00.000Z") }),
        input({ reconciliationId: 4, status: "karangan" }),
      ],
      NOW,
    )
    expect(q.rows.map((r) => r.reconciliationId)).toEqual([1])
    expect(q.totalDocuments).toBe(1)
  })

  it("AC-RBK-B2: umur dari createdAt WIB; == ambang mengendap; masa depan 0 tertanda", () => {
    const q = buildBankReconciliationDraftQueue(
      [
        // 2026-10-24 12:00 WIB dibuat -> umur 3 pada 27 Okt -> mengendap.
        input({ reconciliationId: 1, createdAt: new Date("2026-10-24T05:00:00.000Z") }),
        // Kemarin -> menunggu.
        input({ reconciliationId: 2, createdAt: new Date("2026-10-26T05:00:00.000Z") }),
        // Masa depan (jam server) -> 0 tertanda, bukan negatif.
        input({ reconciliationId: 3, createdAt: new Date("2026-10-28T05:00:00.000Z") }),
      ],
      NOW,
    )
    const byId = new Map(q.rows.map((r) => [r.reconciliationId, r]))
    expect(byId.get(1)).toMatchObject({ umurDraftHari: 3, tingkat: "mengendap", tingkatLabel: "Mengendap" })
    expect(byId.get(2)).toMatchObject({ umurDraftHari: 1, tingkat: "menunggu", tingkatLabel: "Menunggu" })
    expect(byId.get(3)).toMatchObject({ umurDraftHari: 0, umurDariMasaDepan: true })
    expect(q.levelCounts).toEqual({ mengendap: 1, menunggu: 2 })
  })

  it("AC-RBK-B2: urutan createdAt naik, seri id naik", () => {
    const q = buildBankReconciliationDraftQueue(
      [
        input({ reconciliationId: 9, createdAt: new Date("2026-10-25T05:00:00.000Z") }),
        input({ reconciliationId: 3, createdAt: new Date("2026-10-25T05:00:00.000Z") }),
        input({ reconciliationId: 7, createdAt: new Date("2026-10-20T05:00:00.000Z") }),
      ],
      NOW,
    )
    expect(q.rows.map((r) => r.reconciliationId)).toEqual([7, 3, 9])
  })

  it("AC-RBK-B3/B5: hitungan verbatim apa adanya; tanpa item tetap tampil 0; payload tanpa field terlarang", () => {
    const q = buildBankReconciliationDraftQueue(
      [
        input({ reconciliationId: 1, totalItemCount: 5, matchingItemCount: 4, matchedItemCount: 3, adjustmentItemCount: 1 }),
        input({ reconciliationId: 2 }),
      ],
      NOW,
    )
    expect(q.rows[0]).toMatchObject({
      totalItemCount: 5,
      matchingItemCount: 4,
      matchedItemCount: 3,
      adjustmentItemCount: 1,
      statementBalance: 1500000,
      bookBalance: 1400000,
    })
    expect(q.rows[1]).toMatchObject({ totalItemCount: 0, matchedItemCount: 0 })
    for (const row of q.rows) {
      for (const key of ["difference", "adjustedBookBalance", "outstandingDeposits", "outstandingPayments", "persenCocok", "siapSelesai", "statusSeimbang"]) {
        expect(row).not.toHaveProperty(key)
      }
    }
  })
})

describe("getBankReconciliationDraftQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 1 })
    mocks.reconFindMany.mockResolvedValue([])
    mocks.itemFindMany.mockResolvedValue([])
    mocks.accountFindMany.mockResolvedValue([])
  })

  it("AC-RBK-B4: tanpa izin loader melempar sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getBankReconciliationDraftQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_bank_reconciliation")
    expect(mocks.reconFindMany).not.toHaveBeenCalled()
  })

  it("AC-RBK-B1/B3/B4: populasi + agregat massal + saldo verbatim; updatedAt tak pernah dibaca", async () => {
    mocks.reconFindMany.mockResolvedValue([
      {
        id: 5,
        slug: "rec-5",
        reconciliationNumber: "REC-005",
        status: "draft",
        deletedAt: null,
        accountId: 10,
        statementDate: new Date("2026-10-25T00:00:00.000Z"),
        periodStart: null,
        periodEnd: null,
        statementBalance: 1500000,
        bookBalance: 1400000,
        createdAt: new Date("2026-10-20T05:00:00.000Z"),
      },
    ])
    mocks.itemFindMany.mockResolvedValue([
      { bankReconciliationId: 5, bankStatementLineId: 1, journalEntryId: null, matched: true },
      { bankReconciliationId: 5, bankStatementLineId: null, journalEntryId: 2, matched: false },
      { bankReconciliationId: 5, bankStatementLineId: null, journalEntryId: null, matched: false },
    ])
    mocks.accountFindMany.mockResolvedValue([{ id: 10, code: "110201", name: "Bank BCA" }])

    const q = await getBankReconciliationDraftQueue({ now: NOW })
    expect(q.rows).toHaveLength(1)
    expect(q.rows[0]).toMatchObject({
      reconciliationId: 5,
      umurDraftHari: 7,
      tingkat: "mengendap",
      totalItemCount: 3,
      matchingItemCount: 2,
      matchedItemCount: 1,
      adjustmentItemCount: 1,
      statementBalance: 1500000,
      bookBalance: 1400000,
      accountCode: "110201",
      accountName: "Bank BCA",
    })

    // Anti-N+1: tepat 1 query per tabel; select rekonsiliasi tanpa kolom selisih.
    expect(mocks.reconFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.itemFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.accountFindMany).toHaveBeenCalledTimes(1)
    const reconArg = mocks.reconFindMany.mock.calls[0][0]
    expect(reconArg.where).toEqual({ status: "draft", deletedAt: null })
    for (const key of ["difference", "adjustedBookBalance", "outstandingDeposits", "outstandingPayments", "updatedAt"]) {
      expect(reconArg.select).not.toHaveProperty(key)
    }
  })

  it("AC-RBK-B2 (fixture updatedAt baru): umur tetap dari createdAt, updatedAt di baris sumber diabaikan", async () => {
    mocks.reconFindMany.mockResolvedValue([
      {
        id: 7,
        slug: "rec-7",
        reconciliationNumber: "REC-007",
        status: "draft",
        deletedAt: null,
        accountId: 10,
        statementDate: new Date("2026-10-25T00:00:00.000Z"),
        periodStart: null,
        periodEnd: null,
        statementBalance: 100,
        bookBalance: 100,
        createdAt: new Date("2026-10-20T05:00:00.000Z"),
        // Baru saja dicocokkan sebagian: updatedAt hari ini — umur TIDAK boleh mengecil.
        updatedAt: new Date("2026-10-27T05:00:00.000Z"),
      },
    ])
    mocks.itemFindMany.mockResolvedValue([
      { bankReconciliationId: 7, bankStatementLineId: 1, journalEntryId: null, matched: true },
    ])
    mocks.accountFindMany.mockResolvedValue([{ id: 10, code: "110201", name: "Bank BCA" }])
    const q = await getBankReconciliationDraftQueue({ now: NOW })
    expect(q.rows[0]).toMatchObject({ umurDraftHari: 7, tingkat: "mengendap" })
    expect(q.rows[0]).not.toHaveProperty("updatedAt")
  })

  it("AC-RBK-B5: draft tanpa item dari loader tampil hitungan 0", async () => {
    mocks.reconFindMany.mockResolvedValue([
      {
        id: 6,
        slug: null,
        reconciliationNumber: null,
        status: "draft",
        deletedAt: null,
        accountId: 99,
        statementDate: new Date("2026-10-25T00:00:00.000Z"),
        periodStart: null,
        periodEnd: null,
        statementBalance: 0,
        bookBalance: 0,
        createdAt: new Date("2026-10-26T05:00:00.000Z"),
      },
    ])
    mocks.itemFindMany.mockResolvedValue([])
    mocks.accountFindMany.mockResolvedValue([])
    const q = await getBankReconciliationDraftQueue({ now: NOW })
    expect(q.rows[0]).toMatchObject({ totalItemCount: 0, accountCode: null, accountName: null })
  })
})

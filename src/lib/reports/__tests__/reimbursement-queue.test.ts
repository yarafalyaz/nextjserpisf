import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  REIMBURSEMENT_QUEUE_LEVEL_LABELS,
  REIMBURSEMENT_QUEUE_NOTICE_TEXT,
  REIMBURSEMENT_QUEUE_NO_ACCRUAL_LABEL,
  REIMBURSEMENT_QUEUE_PAID_WITHOUT_JOURNAL_LABEL,
  REIMBURSEMENT_QUEUE_STALE_DAYS,
  REIMBURSEMENT_QUEUE_TITLE,
  REIMBURSEMENT_QUEUE_TOTAL_LABEL,
  buildReimbursementQueue,
  type ReimbursementQueueClaimInput,
} from "../reimbursement-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  expenseFindMany: vi.fn(),
  journalFindMany: vi.fn(),
  requirePermission: vi.fn(),
  getHrScope: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expense: { findMany: (...a: unknown[]) => mocks.expenseFindMany(...a) },
    journal: { findMany: (...a: unknown[]) => mocks.journalFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

// Mock scope: "all" tanpa saringan (kasus department diuji lewat where loader lain).
vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: (...a: unknown[]) => mocks.getHrScope(...a),
  hrScopeWhere: (scope: { kind: string }) => (scope.kind === "all" ? {} : { employeeId: -1 }),
}))

import { getReimbursementQueue } from "../reimbursement-queue-data"

const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function claim(overrides: Partial<ReimbursementQueueClaimInput> = {}): ReimbursementQueueClaimInput {
  return {
    claimId: 1,
    slug: "klaim-1",
    documentNo: "RB/2026/001",
    employeeId: 10,
    employeeName: "Pengaju Uji",
    amount: 500_000,
    status: "approved",
    hasAccrualJournal: true,
    hasPaymentJournal: false,
    accrualJournalDate: day(-1),
    createdAt: day(-5),
    ...overrides,
  }
}

describe("reimbursement-queue (F-2026-10-27-082-S + 083-V)", () => {
  it("kata verbatim Q-RBQ-2 + larangan field 083-V", () => {
    expect(REIMBURSEMENT_QUEUE_STALE_DAYS).toBe(3)
    expect(REIMBURSEMENT_QUEUE_TITLE).toBe("Reimbursement Disetujui — Menunggu Pembayaran")
    expect(REIMBURSEMENT_QUEUE_NOTICE_TEXT).toContain("bukan saldo utang atau aging")
    expect(REIMBURSEMENT_QUEUE_PAID_WITHOUT_JOURNAL_LABEL).toBe("Status terbaca dibayar tanpa fakta jurnal")
    expect(REIMBURSEMENT_QUEUE_NO_ACCRUAL_LABEL).toBe("tanpa jurnal akrual")
    expect(REIMBURSEMENT_QUEUE_TOTAL_LABEL).toBe("total nominal tersimpan baris tampil — bukan saldo buku")
    expect(REIMBURSEMENT_QUEUE_LEVEL_LABELS).toEqual({ mengendap: "Mengendap", menunggu: "Menunggu" })
    const queue = buildReimbursementQueue([claim()], NOW)
    const keys = Object.keys(queue.rows[0])
    expect(keys).not.toContain("payableBalance")
    expect(keys).not.toContain("aging")
    expect(keys).not.toContain("saldoUtang")
    expect(keys).not.toContain("receiptImage")
    expect(keys).not.toContain("referenceNo")
  })

  it("AC-RBQ-B1: DIBAYAR/DITOLAK/DIAJUKAN tidak bocor populasi", () => {
    const queue = buildReimbursementQueue(
      [
        claim({ claimId: 1, status: "paid", hasPaymentJournal: true }),
        claim({ claimId: 2, status: "rejected" }),
        claim({ claimId: 3, status: "draft" }),
        claim({ claimId: 4, status: "approved" }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.claimId)).toEqual([4])
    expect(queue.paidWithoutJournalRows).toEqual([])
    expect(queue.totalClaims).toBe(1)
  })

  it("AC-RBQ-B2: paid tanpa J-RB2 = sub-ember terpisah, tahap tetap DISETUJUI", () => {
    const queue = buildReimbursementQueue(
      [claim({ claimId: 1, status: "paid", hasPaymentJournal: false })],
      NOW,
    )
    expect(queue.rows).toEqual([])
    expect(queue.paidWithoutJournalRows).toHaveLength(1)
    expect(queue.paidWithoutJournalRows[0].stage).toBe("DISETUJUI")
    expect(queue.paidWithoutJournalRows[0].stageLabel).toBe("Disetujui")
    expect(queue.paidWithoutJournalLabel).toBe("Status terbaca dibayar tanpa fakta jurnal")
  })

  it("AC-RBQ-B3/Q-RBQ-1: tanpa J-RB1 umur null tertanda, tidak pernah mengendap walau tua", () => {
    const queue = buildReimbursementQueue(
      [claim({ hasAccrualJournal: false, accrualJournalDate: null, createdAt: day(-30) })],
      NOW,
    )
    expect(queue.rows[0].waitingDays).toBeNull()
    expect(queue.rows[0].noAccrualLabel).toBe("tanpa jurnal akrual")
    expect(queue.rows[0].level).toBe("menunggu")
  })

  it("Q-RBQ-1: umur tepat 3 mengendap; urutan mengendap dulu lalu J-RB1 tertua, seri id naik", () => {
    const queue = buildReimbursementQueue(
      [
        claim({ claimId: 3, documentNo: "RB/C", accrualJournalDate: day(-3), createdAt: day(-9) }),
        claim({ claimId: 1, documentNo: "RB/A", accrualJournalDate: day(-10), createdAt: day(-9) }),
        claim({ claimId: 2, documentNo: "RB/B", accrualJournalDate: day(-10), createdAt: day(-9) }),
        claim({ claimId: 4, documentNo: "RB/D", accrualJournalDate: day(-1), createdAt: day(-9) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.claimId)).toEqual([1, 2, 3, 4])
    expect(queue.rows[0].level).toBe("mengendap")
    expect(queue.rows[3].level).toBe("menunggu")
    expect(queue.levelCounts).toEqual({ mengendap: 3, menunggu: 1 })
  })

  it("AC-RBQ-B4: nominal verbatim + total berlabel bukan saldo buku", () => {
    const queue = buildReimbursementQueue(
      [claim({ claimId: 1, amount: 500_000 }), claim({ claimId: 2, amount: 250_000, accrualJournalDate: day(-2) })],
      NOW,
    )
    expect(queue.totalStoredAmount).toBe(750_000)
    expect(queue.totalLabel).toContain("bukan saldo buku")
  })
})

describe("getReimbursementQueue (loader fail-closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1" })
    mocks.getHrScope.mockResolvedValue({ kind: "all" })
    mocks.expenseFindMany.mockResolvedValue([])
    mocks.journalFindMany.mockResolvedValue([])
  })

  it("AC-RBQ-B5: tanpa izin menolak sebelum scope/query", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getReimbursementQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("create_employee_reimbursements")
    expect(mocks.expenseFindMany).not.toHaveBeenCalled()
  })

  it("scope diteruskan hrScopeWhere; jurnal massal aktif saja; tanggal J-RB1 tertua dipakai", async () => {
    mocks.expenseFindMany.mockResolvedValue([
      {
        id: 7, slug: "k7", documentNo: "RB/7", employeeId: 10, amount: 500000,
        status: "approved", createdAt: day(-9), employee: { name: "Pengaju Uji" },
      },
    ])
    mocks.journalFindMany.mockResolvedValue([
      { referenceId: 7, referenceType: "ExpenseReimbursementAccrual", transactionDate: day(-4) },
    ])
    const queue = await getReimbursementQueue({ now: NOW })
    const arg = mocks.expenseFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ isReimbursementClaim: true })
    expect(Object.keys(arg.select)).not.toContain("receiptImage")
    expect(Object.keys(arg.select)).not.toContain("referenceNo")
    const jArg = mocks.journalFindMany.mock.calls[0][0]
    expect(jArg.where.status).toEqual({ not: "REVERSED" })
    expect(jArg.where.deletedAt).toBeNull()
    expect(queue.rows[0].waitingDays).toBe(4)
    expect(queue.rows[0].level).toBe("mengendap")
    expect(queue.rows[0].hasAccrualJournal).toBe(true)
  })
})

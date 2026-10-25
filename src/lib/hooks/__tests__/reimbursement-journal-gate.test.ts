import { describe, it, expect, vi, beforeEach } from "vitest"

// Onti t_b228bac8 (vonis F-2026-10-25-018-V Putusan 2+3): fail-closed
// 210209 nonaktif + hanya J-RB1/J-RB2 AKTIF yang menghitung. Store jurnal
// in-memory menghormati filter status/deletedAt persis query Prisma.

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn(async () => undefined),
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))

import {
  onReimbursementClaimApproved,
  onReimbursementClaimPaid,
  REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
  REIMBURSEMENT_PAYMENT_REFERENCE_TYPE,
} from "../accounting.hook"

type JournalRow = {
  id: number
  referenceType: string
  referenceId: number
  status: string
  deletedAt: Date | null
  totalDebit: number
}

let journals: JournalRow[]
let liabilityActive: boolean
let journalCreateCount: number

function matches(row: JournalRow, where: Record<string, unknown>): boolean {
  if (where.referenceType && row.referenceType !== where.referenceType) return false
  if (where.referenceId && row.referenceId !== where.referenceId) return false
  const st = where.status as { not?: string } | undefined
  if (st?.not && row.status === st.not) return false
  if ("deletedAt" in where && where.deletedAt === null && row.deletedAt !== null) return false
  return true
}

function makeTx() {
  return {
    systemSetting: {
      findFirst: async () => ({ reimbursementLiabilityAccountId: 209 }),
    },
    account: {
      findUnique: async () => ({ id: 209, code: "210209", isActive: liabilityActive }),
      findMany: async (a: { where: { id: { in: number[] } } }) =>
        a.where.id.in.map((id) => ({ id })),
    },
    expense: {
      findUniqueOrThrow: async () => ({
        id: 42,
        documentNo: "EXP-0042",
        isReimbursementClaim: true,
        accountId: 610,
        amount: 150000,
        description: "Bensin",
        costCenterId: null,
        paidFromAccountId: 100,
      }),
    },
    journal: {
      findFirst: async (a: { where: Record<string, unknown> }) =>
        journals.find((j) => matches(j, a.where)) ?? null,
      create: async (a: { data: Record<string, unknown> }) => {
        journalCreateCount++
        const row: JournalRow = {
          id: journals.length + 1,
          referenceType: String(a.data.referenceType),
          referenceId: Number(a.data.referenceId),
          status: String(a.data.status),
          deletedAt: null,
          totalDebit: Number(a.data.totalDebit),
        }
        journals.push(row)
        return row
      },
    },
    journalEntry: { createMany: async () => ({ count: 2 }) },
  }
}

beforeEach(() => {
  journals = []
  liabilityActive = true
  journalCreateCount = 0
})

describe("onReimbursementClaimApproved (018-V Putusan 3)", () => {
  it("(c) akun 210209 nonaktif -> approve ditolak fail-closed, nol jurnal akrual", async () => {
    liabilityActive = false
    await expect(
      onReimbursementClaimApproved(42, 7, makeTx() as never),
    ).rejects.toThrow(/210209.*nonaktif/)
    expect(journalCreateCount).toBe(0)
    expect(journals).toHaveLength(0)
  })

  it("(a) approve dua kali -> jurnal akrual tetap 1", async () => {
    const tx = makeTx()
    await onReimbursementClaimApproved(42, 7, tx as never)
    await onReimbursementClaimApproved(42, 7, tx as never)
    expect(
      journals.filter((j) => j.referenceType === REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE),
    ).toHaveLength(1)
  })
})

describe("onReimbursementClaimPaid (018-V Putusan 2)", () => {
  it("(d) hanya J-RB1 REVERSED -> bayar ditolak, nol J-RB2", async () => {
    journals.push({
      id: 1,
      referenceType: REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
      referenceId: 42,
      status: "REVERSED",
      deletedAt: null,
      totalDebit: 150000,
    })
    await expect(
      onReimbursementClaimPaid(42, 7, makeTx() as never),
    ).rejects.toThrow(/belum punya jurnal akrual J-RB1/)
    expect(
      journals.filter((j) => j.referenceType === REIMBURSEMENT_PAYMENT_REFERENCE_TYPE),
    ).toHaveLength(0)
  })

  it("J-RB1 aktif -> J-RB2 terposting tepat 1", async () => {
    journals.push({
      id: 1,
      referenceType: REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
      referenceId: 42,
      status: "POSTED",
      deletedAt: null,
      totalDebit: 150000,
    })
    const tx = makeTx()
    await onReimbursementClaimPaid(42, 7, tx as never)
    await onReimbursementClaimPaid(42, 7, tx as never)
    expect(
      journals.filter((j) => j.referenceType === REIMBURSEMENT_PAYMENT_REFERENCE_TYPE),
    ).toHaveLength(1)
  })
})

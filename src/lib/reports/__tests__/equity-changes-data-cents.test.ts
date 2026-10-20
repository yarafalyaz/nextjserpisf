import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader Perubahan Ekuitas: opening/closing per akun dihitung di loader
 * sebagai credit - debit mentah. Saldo memenuhi 3 baris sen kecil
 * (credit 0.24, debit 0.07 berulang) membuat opening/closing/movement
 * membawa sisa float (0.16999999999999998 dsb) ke builder — builder
 * safeAdd tidak bisa membersihkan nilai yang sudah kotor dari sumber.
 *
 * FP proof (node): 0.24-0.07 = 0.16999999999999998, 17x akumulasi di
 * lapisan loader meniru pola drift 4.080000000000002.
 */

const mocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  groupBy: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    account: { findMany: mocks.accountFindMany },
    journalEntry: { groupBy: mocks.groupBy },
  },
}))

import { loadEquityChanges } from "../equity-changes-data"

const PERIOD = { start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-10-31T23:59:59.999Z") }

function equityAccount(id: number) {
  return { id, code: `3${String(id).padStart(3, "0")}`, name: "Modal", type: "EQUITY", reportGroup: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accountFindMany.mockResolvedValue([equityAccount(1)])
  // 3 panggilan sumEntriesByAccount: opening (lt), closing (lte), period.
  // credit 100.10 debit 100.07 -> saldo 0.030000000000001137 float mentah.
  mocks.groupBy.mockResolvedValue([{ accountId: 1, _sum: { debit: 100.07, credit: 100.1 } }])
})

describe("loadEquityChanges presisi sen loader", () => {
  it("opening/closing saldo kredit-debit persis sen", async () => {
    const r = await loadEquityChanges(PERIOD)
    expect(r.accounts).toHaveLength(1)
    expect(r.accounts[0].opening).toBe(0.03)
    expect(r.accounts[0].closing).toBe(0.03)
    expect(r.accounts[0].movement).toBe(0)
  })
})

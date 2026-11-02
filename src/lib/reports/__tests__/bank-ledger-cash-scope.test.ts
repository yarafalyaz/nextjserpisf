import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  prisma: {
    systemSetting: { findFirst: vi.fn() },
    account: { findFirst: vi.fn(), findMany: vi.fn() },
    journalEntry: { findMany: vi.fn(), aggregate: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/services/report-aggregation.service", () => ({
  REPORT_JOURNAL_STATUSES: ["POSTED", "REVERSED"],
  sumEntriesByAccount: vi.fn(async () => new Map()),
  sumNetForAccount: vi.fn(async () => 0),
}))

import { loadBankLedger } from "../ledger-cash-data"

const period = { start: new Date("2026-10-01T00:00:00+07:00"), end: new Date("2026-10-31T23:59:59+07:00") }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prisma.systemSetting.findFirst.mockResolvedValue({ cashBankAccountId: null, pettyCashAccountId: null })
  mocks.prisma.account.findMany.mockResolvedValue([])
  mocks.prisma.journalEntry.findMany.mockResolvedValue([])
})

describe("loadBankLedger himpunan kas kanonis (putaran 75)", () => {
  it("akun non-kas/bank (di luar settings ∪ reportGroup BANK) ditolak dengan pesan penjelas", async () => {
    mocks.prisma.account.findFirst.mockResolvedValue({ id: 55 })
    const report = await loadBankLedger(period, "akun-piutang")
    const text = JSON.stringify(report.table.rows)
    expect(text).toContain("bukan rekening kas/bank")
    expect(mocks.prisma.journalEntry.findMany).not.toHaveBeenCalled()
  })

  it("akun reportGroup BANK lolos gerbang dan ledger dimuat", async () => {
    mocks.prisma.account.findFirst.mockResolvedValue({ id: 55 })
    mocks.prisma.account.findMany.mockResolvedValue([{ id: 55 }])
    const report = await loadBankLedger(period, "bank-utama")
    const text = JSON.stringify(report.table.rows)
    expect(text).not.toContain("bukan rekening kas/bank")
    expect(mocks.prisma.journalEntry.findMany).toHaveBeenCalled()
  })

  it("akun terkonfigurasi settings lolos walau reportGroup bukan BANK", async () => {
    mocks.prisma.systemSetting.findFirst.mockResolvedValue({ cashBankAccountId: 77, pettyCashAccountId: null })
    mocks.prisma.account.findFirst.mockResolvedValue({ id: 77 })
    mocks.prisma.account.findMany.mockResolvedValue([{ id: 77 }])
    const report = await loadBankLedger(period, "kas-besar")
    const text = JSON.stringify(report.table.rows)
    expect(text).not.toContain("bukan rekening kas/bank")
  })
})

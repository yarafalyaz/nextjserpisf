import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Pratinjau jurnal penutup tahunan (F-2026-10-20-86, read-only).
 * Yang dijaga per vonis accountant: hanya jurnal POSTED dihitung, akun
 * kontra arahnya terbalik, baris lawan laba ditahan terpisah per pusat
 * laba (termasuk tanpa pusat laba), total debet = kredit persis sen,
 * tanggal penutup mengikuti bulan mulai tahun fiskal, dan akun tujuan
 * tidak ditebak selama pengaturan kosong.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    account: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
    journal: { findFirst: vi.fn() },
    profitCenter: { findMany: vi.fn() },
    systemSetting: { findFirst: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getYearEndClosingPreview } from "../year-end-closing-data"
import {
  buildYearEndClosingPreview,
  fiscalYearPeriod,
  type YearEndClosingEntryInput,
} from "../year-end-closing"

function entry(over: Partial<YearEndClosingEntryInput>): YearEndClosingEntryInput {
  return {
    accountId: 1,
    accountCode: "400001",
    accountName: "Pendapatan Jasa",
    accountType: "REVENUE",
    profitCenterId: 1,
    profitCenterCode: "PC-A",
    journalStatus: "POSTED",
    debit: 0,
    credit: 1_000_000,
    ...over,
  }
}

function preview(entries: readonly YearEndClosingEntryInput[], over: Partial<Parameters<typeof buildYearEndClosingPreview>[0]> = {}) {
  return buildYearEndClosingPreview({
    fiscalYear: 2026,
    fiscalYearStartMonth: 1,
    retainedEarningsAccountId: null,
    alreadyClosed: false,
    entries,
    ...over,
  })
}

describe("buildYearEndClosingPreview", () => {
  it("total debet = total kredit persis sen; laba bersih = pendapatan - beban", () => {
    const r = preview([
      entry({ credit: 1_000_000.1 }),
      entry({
        accountId: 2,
        accountCode: "600001",
        accountName: "Beban Gaji",
        accountType: "EXPENSE",
        debit: 400_000.05,
        credit: 0,
      }),
    ])
    expect(r.netProfit).toBe(600_000.05)
    expect(r.totalDebit).toBe(1_000_000.1)
    expect(r.totalCredit).toBe(1_000_000.1)
    expect(r.difference).toBe(0)
    expect(r.balanced).toBe(true)
    expect(r.retainedLines).toEqual([{ profitCenterId: 1, profitCenterCode: "PC-A", netProfit: 600_000.05, direction: "credit" }])
  })

  it("akun kontra bersaldo lawan normal ditutup arah terbalik", () => {
    // Diskon Penjualan: REVENUE bersaldo debit 50rb -> penutup kredit 50rb.
    const r = preview([
      entry({ credit: 1_000_000 }),
      entry({ accountId: 3, accountCode: "400004", accountName: "Diskon Penjualan", debit: 50_000, credit: 0 }),
    ])
    const discount = r.lines.find((line) => line.accountId === 3)
    expect(discount).toMatchObject({ balance: -50_000, closingDirection: "credit", closingAmount: 50_000 })
    expect(r.netProfit).toBe(950_000)
    expect(r.balanced).toBe(true)
  })

  it("rugi bersih: baris lawan laba ditahan didebit", () => {
    const r = preview([
      entry({
        accountId: 2,
        accountCode: "600001",
        accountName: "Beban Gaji",
        accountType: "EXPENSE",
        debit: 700_000,
        credit: 0,
      }),
    ])
    expect(r.netProfit).toBe(-700_000)
    expect(r.retainedLines).toEqual([{ profitCenterId: 1, profitCenterCode: "PC-A", netProfit: -700_000, direction: "debit" }])
    expect(r.totalDebit).toBe(700_000)
    expect(r.totalCredit).toBe(700_000)
    expect(r.balanced).toBe(true)
  })

  it("dua pusat laba + satu tanpa pusat laba = tiga baris lawan terpisah", () => {
    const r = preview([
      entry({ credit: 1_000_000 }),
      entry({ accountId: 4, accountCode: "400002", accountName: "Pendapatan Lain", profitCenterId: 2, profitCenterCode: "PC-B", credit: 200_000 }),
      entry({ accountId: 5, accountCode: "400003", accountName: "Pendapatan Tanpa PC", profitCenterId: null, profitCenterCode: null, credit: 50_000 }),
    ])
    expect(r.retainedLines).toHaveLength(3)
    expect(r.retainedLines.map((line) => line.profitCenterId)).toEqual([null, 1, 2])
    expect(r.balanced).toBe(true)
  })

  it("jurnal DRAFT dan akun neraca tidak ikut saldo; pasangan REVERSED+POSTED neto nol", () => {
    const r = preview([
      entry({ journalStatus: "DRAFT", credit: 9_000_000 }),
      // Pasangan yang sudah direversal: asli REVERSED (kredit) + lawan POSTED
      // (debit) pada akun yang sama harus neto nol — bukan salah satu saja.
      entry({ journalStatus: "REVERSED", credit: 8_000_000 }),
      entry({ journalStatus: "POSTED", debit: 8_000_000, credit: 0 }),
      entry({ accountId: 9, accountCode: "1103", accountName: "Piutang Usaha", accountType: "ASSET", debit: 7_000_000, credit: 0 }),
      entry({ credit: 100_000 }),
    ])
    expect(r.lines).toHaveLength(1)
    expect(r.netProfit).toBe(100_000)
  })

  it("REVERSED + counterpart menghasilkan neto nol di closing (tidak ada entri sebelah)", () => {
    // Skenario TASK-014: jurnal pendapatan sudah direversal di tahun yang
    // sama. Loader lama hanya POSTED → hanya lawan debit 1jt yang dihitung,
    // menghasilkan baris penutup kredit 1jt yatim. Keduanya (POSTED+REVERSED,
    // REPORT_JOURNAL_STATUSES) harus neto nol.
    const r = preview([
      entry({ journalStatus: "REVERSED", credit: 1_000_000 }),
      entry({ journalStatus: "POSTED", debit: 1_000_000, credit: 0 }),
    ])
    expect(r.lines).toEqual([])
    expect(r.retainedLines).toEqual([])
    expect(r.netProfit).toBe(0)
    expect(r.totalDebit).toBe(0)
    expect(r.totalCredit).toBe(0)
    expect(r.balanced).toBe(true)
  })

  it("REVERSED expense + counterpart juga neto nol per profitCenter", () => {
    const r = preview([
      entry({
        accountId: 2,
        accountCode: "600001",
        accountName: "Beban Gaji",
        accountType: "EXPENSE",
        journalStatus: "REVERSED",
        debit: 400_000,
        credit: 0,
      }),
      entry({
        accountId: 2,
        accountCode: "600001",
        accountName: "Beban Gaji",
        accountType: "EXPENSE",
        journalStatus: "POSTED",
        debit: 0,
        credit: 400_000,
      }),
      entry({ credit: 250_000 }),
    ])
    // Hanya pendapatan 250rb yang tersisa untuk ditutup.
    expect(r.lines).toHaveLength(1)
    expect(r.netProfit).toBe(250_000)
  })

  it("saldo nol tidak menghasilkan baris; akun tujuan kosong = belum dipetakan", () => {
    const r = preview([entry({ debit: 100, credit: 100 })], { retainedEarningsAccountId: null })
    expect(r.lines).toEqual([])
    expect(r.retainedLines).toEqual([])
    expect(r).toMatchObject({ totalDebit: 0, totalCredit: 0, balanced: true, retainedEarningsMapped: false, alreadyClosed: false })
    const mapped = preview([], { retainedEarningsAccountId: 42, alreadyClosed: true })
    expect(mapped).toMatchObject({ retainedEarningsMapped: true, alreadyClosed: true })
  })

  it("tanggal penutup mengikuti bulan mulai tahun fiskal", () => {
    expect(fiscalYearPeriod(2026, 1).end.toISOString()).toBe("2026-12-31T23:59:59.999Z")
    const july = fiscalYearPeriod(2026, 7)
    expect(july.start.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(july.end.toISOString()).toBe("2027-06-30T23:59:59.999Z")
    expect(preview([], { fiscalYearStartMonth: 7 }).closingDate.toISOString()).toBe("2027-06-30T23:59:59.999Z")
  })
})

describe("getYearEndClosingPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ id: 1, fiscalYearStartMonth: 4 })
    mocks.prismaMock.account.findMany.mockResolvedValue([
      { id: 1, code: "400001", name: "Pendapatan Jasa", type: "REVENUE" },
    ])
    mocks.prismaMock.profitCenter.findMany.mockResolvedValue([{ id: 1, code: "PC-A" }])
    mocks.prismaMock.journalEntry.findMany.mockResolvedValue([
      { accountId: 1, profitCenterId: 1, debit: { toString: () => "0" }, credit: { toString: () => "250000" }, journal: { status: "POSTED" } },
    ])
    mocks.prismaMock.journal.findFirst.mockResolvedValue(null)
  })

  it("loader massal: POSTED+REVERSED dalam tahun fiskal, akun tujuan belum dipetakan", async () => {
    const r = await getYearEndClosingPreview(2026)
    expect(mocks.prismaMock.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          journal: expect.objectContaining({
            status: { in: ["POSTED", "REVERSED"] },
            transactionDate: { gte: new Date("2026-04-01T00:00:00.000Z"), lte: new Date("2027-03-31T23:59:59.999Z") },
          }),
        }),
      }),
    )
    expect(mocks.prismaMock.journal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ referenceType: "YearEndClosing", referenceId: 2026, status: "POSTED" }) }),
    )
    expect(r).toMatchObject({ netProfit: 250_000, balanced: true, retainedEarningsMapped: false, alreadyClosed: false })
    expect(r.retainedLines[0]).toMatchObject({ profitCenterCode: "PC-A", direction: "credit" })
  })
})

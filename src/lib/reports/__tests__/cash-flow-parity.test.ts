import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    systemSetting: { findFirst: vi.fn() },
    account: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
  },
  sumMock: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/services/report-aggregation.service", () => ({
  sumEntriesByAccount: mocks.sumMock,
}))

import { loadCashFlow } from "../ledger-cash-data"

const KAS = { id: 1, type: "ASSET", code: "1000", name: "Kas" }
const BANK = { id: 2, type: "ASSET", code: "1010", name: "Bank" }
const PENDAPATAN = { id: 3, type: "REVENUE", code: "4000", name: "Pendapatan" }
const tgl = new Date(2026, 9, 5)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ cashBankAccountId: 1, pettyCashAccountId: null })
  mocks.prismaMock.account.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
  mocks.sumMock.mockResolvedValue(new Map([[1, { debit: 5_000_000, credit: 0 }]]))
  // Jurnal 10: transfer Kas→Bank (tak terklasifikasi). Jurnal 11: jual tunai.
  mocks.prismaMock.journalEntry.findMany.mockResolvedValue([
    { journalId: 10, accountId: 1, debit: 0, credit: 10_000_000, journal: { description: "Transfer", transactionDate: tgl } },
    { journalId: 10, accountId: 2, debit: 10_000_000, credit: 0, journal: { description: "Transfer", transactionDate: tgl } },
    { journalId: 11, accountId: 1, debit: 3_000_000, credit: 0, journal: { description: "Jual tunai", transactionDate: tgl } },
    // Jurnal 12: hanya baris kas (tanpa counterpart non-kas di jurnal penuh)
    // → classifyJournal null, tetapi mutasi kasnya nyata di layar.
    { journalId: 12, accountId: 1, debit: 7_000_000, credit: 0, journal: { description: "Kas murni", transactionDate: tgl } },
  ])
  mocks.prismaMock.journal.findMany.mockResolvedValue([
    {
      id: 10,
      entries: [
        { accountId: 1, debit: 0, credit: 10_000_000, account: KAS },
        { accountId: 2, debit: 10_000_000, credit: 0, account: BANK },
      ],
    },
    {
      id: 11,
      entries: [
        { accountId: 1, debit: 3_000_000, credit: 0, account: KAS },
        { accountId: 3, debit: 0, credit: 3_000_000, account: PENDAPATAN },
      ],
    },
    {
      id: 12,
      entries: [{ accountId: 1, debit: 7_000_000, credit: 0, account: KAS }],
    },
  ])
})

describe("arus kas PDF paritas layar (loadCashFlow)", () => {
  it("saldo akhir = awal + neto semua entri kas, bukan neto aktivitas saja", async () => {
    const view = await loadCashFlow({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    const rows = view.statement.rows
    const grand = rows.find((r) => r.kind === "grand")
    const subtotal = rows.find((r) => r.kind === "subtotal")
    const takTerklasifikasi = rows.find(
      (r) => r.kind === "line" && r.name === "Mutasi Kas Tak Terklasifikasi",
    )
    // Awal 5jt; neto kas = -10jt +10jt +3jt +7jt = 10jt → akhir 15jt.
    // Neto aktivitas hanya 3jt; selisih 7jt wajib tampil sebagai baris sendiri.
    expect(grand?.kind === "grand" && grand.values[0]).toContain("15")
    expect(subtotal?.kind === "subtotal" && subtotal.values[0]).toContain("10")
    expect(takTerklasifikasi?.kind === "line" && takTerklasifikasi.values[0]).toContain("7")
  })

  it("putaran 55: himpunan kas = configured ∪ reportGroup BANK, bukan heuristik nama", async () => {
    // Akun ASSET bernama "Kasbon Direksi"/"Piutang Bank Garansi" lolos
    // contains Kas/Bank lama dan mencemari saldo akhir laporan.
    // Himpunan kanonis repo = configured settings ∪ reportGroup "BANK"
    // (form pembayaran/transfer), live saja.
    await loadCashFlow({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })
    expect(mocks.prismaMock.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: "ASSET",
          isActive: true,
          deletedAt: null,
          OR: [{ id: { in: [1] } }, { reportGroup: "BANK" }],
        },
      }),
    )
  })
})

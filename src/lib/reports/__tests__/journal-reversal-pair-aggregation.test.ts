import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * TASK-022 — pasangan reversal harus neto nol di agregasi saldo jurnal
 * berbasis akun (tanpa filter referenceType):
 * - provisi garansi (deferred-tax-nonaset-data): aggregate kredit−debit
 *   akun provisi s.d. tanggal neraca.
 * - kompensasi PKWT (pkwt-compensation-data): reduce kredit−debit akun
 *   utang 210207.
 *
 * Jurnal lawan reversal berstatus POSTED dengan debit/kredit tertukar dan
 * jurnal asli menjadi REVERSED (journal.service reverseJournal /
 * reverseJournalsByReferenceTx). Agregasi POSTED-saja menghitung lawan
 * tanpa asli → saldo yatim −nominal. Mock di bawah meniru penyaringan
 * status DB: baris hanya lolos bila status jurnalnya cocok dengan
 * klausa `where` loader, jadi tes ini merah pada filter POSTED-saja.
 */

const mocks = vi.hoisted(() => ({
  systemSettingFindFirst: vi.fn(),
  journalEntryAggregate: vi.fn(),
  journalEntryCount: vi.fn(),
  journalEntryFindMany: vi.fn(),
  eventFindMany: vi.fn(),
  accrualGroupBy: vi.fn(),
  lineFindMany: vi.fn(),
  payrollFindMany: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.systemSettingFindFirst },
    journalEntry: {
      aggregate: mocks.journalEntryAggregate,
      count: mocks.journalEntryCount,
      findMany: mocks.journalEntryFindMany,
    },
    pkwtCompensationEvent: { findMany: mocks.eventFindMany },
    pkwtCompensationAccrual: { groupBy: mocks.accrualGroupBy },
    payrollComponentLine: { findMany: mocks.lineFindMany },
    payroll: { findMany: mocks.payrollFindMany },
  },
}))

import { loadDeferredTaxNonAssetSources } from "../deferred-tax-nonaset-data"
import { getPkwtCompensationReport } from "../pkwt-compensation-data"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"

type StatusClause = string | { in: readonly string[] } | undefined

function statusMatches(clause: StatusClause, status: string): boolean {
  if (clause === undefined) return true
  if (typeof clause === "string") return clause === status
  return clause.in.includes(status)
}

/** Baris jurnalEntry tiruan: satu baris per entri, status di jurnal induk. */
interface EntryFixture {
  journalStatus: string
  debit: number
  credit: number
}

function filteredEntries(where: { journal?: { status?: StatusClause } }): EntryFixture[] {
  return fixtures.filter((f) => statusMatches(where.journal?.status, f.journalStatus))
}

let fixtures: EntryFixture[] = []

beforeEach(() => {
  vi.clearAllMocks()
  fixtures = []
  mocks.eventFindMany.mockResolvedValue([])
  mocks.accrualGroupBy.mockResolvedValue([])
  mocks.lineFindMany.mockResolvedValue([])
  mocks.payrollFindMany.mockResolvedValue([])
  mocks.journalEntryAggregate.mockImplementation(async ({ where }: { where: { journal?: { status?: StatusClause } } }) => {
    const rows = filteredEntries(where)
    return {
      _sum: {
        debit: rows.reduce((s, r) => s + r.debit, 0),
        credit: rows.reduce((s, r) => s + r.credit, 0),
      },
    }
  })
  mocks.journalEntryCount.mockImplementation(async ({ where }: { where: { journal?: { status?: StatusClause } } }) =>
    filteredEntries(where).length,
  )
  mocks.journalEntryFindMany.mockImplementation(async ({ where }: { where: { journal?: { status?: StatusClause } } }) =>
    filteredEntries(where).map((r) => ({ debit: r.debit, credit: r.credit })),
  )
})

describe("provisi garansi — pasangan reversal neto nol", () => {
  it("jurnal POSTED asli lalu dibalik (REVERSED + lawan POSTED) → saldo 0 terverifikasi", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({ warrantyProvisionAccountId: 210205 })
    // Asli: kredit provisi 1.000.000 (kini REVERSED); lawan: debit 1.000.000 (POSTED).
    fixtures = [
      { journalStatus: "REVERSED", debit: 0, credit: 1_000_000 },
      { journalStatus: "POSTED", debit: 1_000_000, credit: 0 },
    ]

    const { report } = await loadDeferredTaxNonAssetSources({
      taxRatePercent: 22,
      asOf: new Date("2026-12-31T00:00:00.000Z"),
    })

    const provision = report.lines.find((l) => l.source === "warranty-provision")
    expect(provision?.status).toBe("zero-verified")
    expect(provision?.carryingAmount).toBe(0)
    expect(mocks.journalEntryAggregate.mock.calls[0][0].where.journal.status).toEqual({
      in: [...REPORT_JOURNAL_STATUSES],
    })
    expect(mocks.journalEntryAggregate.mock.calls[0][0].where.journal.deletedAt).toBeNull()
    expect(mocks.journalEntryCount.mock.calls[0][0].where.journal.status).toEqual({
      in: [...REPORT_JOURNAL_STATUSES],
    })
  })

  it("jurnal DRAFT tidak terhitung", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({ warrantyProvisionAccountId: 210205 })
    fixtures = [{ journalStatus: "DRAFT", debit: 0, credit: 1_000_000 }]
    const { report } = await loadDeferredTaxNonAssetSources({
      taxRatePercent: 22,
      asOf: new Date("2026-12-31T00:00:00.000Z"),
    })
    const provision = report.lines.find((l) => l.source === "warranty-provision")
    expect(provision?.status).toBe("zero-verified")
    expect(provision?.carryingAmount).toBe(0)
  })

  it("jurnal POSTED tanpa reversal tetap terhitung penuh", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({ warrantyProvisionAccountId: 210205 })
    fixtures = [{ journalStatus: "POSTED", debit: 0, credit: 1_000_000 }]

    const { report } = await loadDeferredTaxNonAssetSources({
      taxRatePercent: 22,
      asOf: new Date("2026-12-31T00:00:00.000Z"),
    })

    const provision = report.lines.find((l) => l.source === "warranty-provision")
    expect(provision?.status).toBe("computed")
    expect(provision?.carryingAmount).toBe(1_000_000)
  })
})

describe("kompensasi PKWT — pasangan reversal neto nol", () => {
  it("jurnal POSTED asli lalu dibalik (REVERSED + lawan POSTED) → saldo GL 0", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      pkwtCompensationExpenseAccountId: 10,
      pkwtCompensationPayableAccountId: 20,
    })
    fixtures = [
      { journalStatus: "REVERSED", debit: 0, credit: 9_000_000 },
      { journalStatus: "POSTED", debit: 9_000_000, credit: 0 },
    ]

    const report = await getPkwtCompensationReport({ kind: "all" })

    expect(report.glPayableBalance).toBe(0)
    expect(mocks.journalEntryFindMany.mock.calls[0][0].where.journal.status).toEqual({
      in: [...REPORT_JOURNAL_STATUSES],
    })
    expect(mocks.journalEntryFindMany.mock.calls[0][0].where.journal.deletedAt).toBeNull()
  })

  it("jurnal DRAFT tidak terhitung di saldo GL PKWT", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      pkwtCompensationExpenseAccountId: 10,
      pkwtCompensationPayableAccountId: 20,
    })
    fixtures = [{ journalStatus: "DRAFT", debit: 0, credit: 9_000_000 }]
    const report = await getPkwtCompensationReport({ kind: "all" })
    expect(report.glPayableBalance).toBe(0)
  })

  it("jurnal POSTED tanpa reversal tetap terhitung penuh", async () => {
    mocks.systemSettingFindFirst.mockResolvedValue({
      pkwtCompensationExpenseAccountId: 10,
      pkwtCompensationPayableAccountId: 20,
    })
    fixtures = [{ journalStatus: "POSTED", debit: 0, credit: 9_000_000 }]

    const report = await getPkwtCompensationReport({ kind: "all" })

    expect(report.glPayableBalance).toBe(9_000_000)
  })
})

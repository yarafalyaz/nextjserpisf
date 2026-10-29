import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  loadBalanceSheetStatement,
  loadIncomeStatementByCostCenter,
  loadIncomeStatementStatement,
} from "../statement-data"
import { DEFAULT_STATEMENT_OPTIONS } from "@/lib/reports/statement-display"

const mocks = vi.hoisted(() => ({
  journalEntryFindMany: vi.fn(),
  accountFindMany: vi.fn(),
  costCenterFindMany: vi.fn(),
  costCenterFindUnique: vi.fn(),
  sumEntriesByAccount: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    journalEntry: { findMany: (...args: unknown[]) => mocks.journalEntryFindMany(...args) },
    account: { findMany: (...args: unknown[]) => mocks.accountFindMany(...args) },
    costCenter: {
      findMany: (...args: unknown[]) => mocks.costCenterFindMany(...args),
      findUnique: (...args: unknown[]) => mocks.costCenterFindUnique(...args),
    },
  },
}))

vi.mock("@/lib/services/report-aggregation.service", () => ({
  REPORT_JOURNAL_STATUSES: ["POSTED", "REVERSED"],
  sumEntriesByAccount: (...args: unknown[]) => mocks.sumEntriesByAccount(...args),
}))

const ASSET_ACCOUNT = {
  id: 1,
  code: "1000",
  name: "Kas",
  type: "ASSET",
  parentId: null,
  reportGroup: "CASH",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.journalEntryFindMany.mockResolvedValue([])
  mocks.accountFindMany.mockResolvedValue([ASSET_ACCOUNT])
  mocks.sumEntriesByAccount.mockResolvedValue(new Map())
  mocks.costCenterFindMany.mockResolvedValue([])
  mocks.costCenterFindUnique.mockResolvedValue({ code: "CC-01", name: "Bengkel" })
})

describe("loadBalanceSheetStatement", () => {
  it("memformat tanggal posisi dan kolom angka dengan benar", async () => {
    const statement = await loadBalanceSheetStatement(
      new Date(2026, 9, 31),
      DEFAULT_STATEMENT_OPTIONS,
    )

    expect(statement.asOfLabel).toBe("31 Oktober 2026")
    expect(statement.periodLabel).toBe("Per 31 Oktober 2026")
    expect(statement.periodCaption).toBe("Per 31 Oktober 2026")
    // Kolom angka TIDAK mengulang periode: periode sudah tercetak di baris meta
    // tepat di atas tabel, dan pengulangannya membuat kop terlihat berantakan
    // (bandingkan Accurate yang memakai "Nilai (IDR)").
    expect(statement.table.columns[2].header).toBe("Nilai (IDR)")
  })

  it("menjumlahkan saldo aset dari jurnal dan melaporkan neraca yang tidak seimbang", async () => {
    mocks.sumEntriesByAccount.mockResolvedValue(new Map([[1, { debit: 1_500_000, credit: 0 }]]))

    const statement = await loadBalanceSheetStatement(
      new Date(2026, 9, 31),
      DEFAULT_STATEMENT_OPTIONS,
    )

    const subtotal = statement.table.rows.find(
      (row) => row.kind === "subtotal" && row.label === "Jumlah Aset",
    )
    expect(subtotal).toMatchObject({ values: ["1.500.000"] })

    // Aset 1.500.000 tanpa kewajiban/ekuitas → tidak seimbang, harus diberitahukan.
    const notice = statement.table.rows.at(-1)
    expect(notice?.kind).toBe("notice")
    expect(notice?.kind === "notice" ? notice.text : "").toContain("selisih 1.500.000")
  })

  it("menyusun baris akun sesuai opsi tampilan yang aktif", async () => {
    mocks.sumEntriesByAccount.mockResolvedValue(new Map([[1, { debit: 1_000_000, credit: 0 }]]))

    const hidden = await loadBalanceSheetStatement(new Date(2026, 9, 31), {
      ...DEFAULT_STATEMENT_OPTIONS,
      totalsOnly: true,
    })
    expect(hidden.table.rows.some((row) => row.kind === "line")).toBe(false)

    const shown = await loadBalanceSheetStatement(new Date(2026, 9, 31), DEFAULT_STATEMENT_OPTIONS)
    expect(shown.table.rows.some((row) => row.kind === "line" && row.name === "Kas")).toBe(true)
  })
})

describe("loadIncomeStatementStatement", () => {
  it("memformat label periode, caption, dan kolom angka", async () => {
    const statement = await loadIncomeStatementStatement(
      { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
      DEFAULT_STATEMENT_OPTIONS,
      false,
    )

    expect(statement.periodLabel).toBe("Periode 1 Okt 2026 – 31 Okt 2026")
    expect(statement.periodCaption).toBe("Dari 01 Okt 2026 s/d 31 Okt 2026")
    expect(statement.columnLabel).toBe("1 Okt - 31 Okt 2026")
    expect(statement.table.columns[2].header).toBe("Nilai (IDR)")
  })

  it("menghitung pendapatan dari jurnal dan menambah kolom persen bila diminta", async () => {
    mocks.accountFindMany.mockResolvedValue([
      { id: 1, code: "4000", name: "Penjualan", type: "REVENUE", parentId: null, reportGroup: "REVE" },
      { id: 2, code: "5000", name: "HPP", type: "EXPENSE", parentId: null, reportGroup: "COGS" },
    ])
    mocks.sumEntriesByAccount.mockResolvedValue(
      new Map([
        [1, { debit: 0, credit: 1_000_000 }],
        [2, { debit: 400_000, credit: 0 }],
      ]),
    )

    const statement = await loadIncomeStatementStatement(
      { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
      DEFAULT_STATEMENT_OPTIONS,
      true,
    )

    expect(statement.table.columns).toHaveLength(4)

    const penjualan = statement.table.rows.find((row) => row.kind === "line" && row.name === "Penjualan")
    expect(penjualan).toMatchObject({ values: ["1.000.000", "100.0%"] })

    const labaKotor = statement.table.rows.find((row) => row.kind === "total" && row.label === "Laba Kotor")
    expect(labaKotor).toMatchObject({ values: ["600.000", "60.0%"] })

    const labaBersih = statement.table.rows.at(-1)
    expect(labaBersih).toMatchObject({ kind: "grand", label: "Laba Bersih", values: ["600.000", "60.0%"] })
  })
})

describe("loadIncomeStatementByCostCenter", () => {
  const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31, 23, 59, 59, 999) }

  it("memakai reportGroup sehingga HPP di kode 5101 tetap masuk HPP", async () => {
    // Regresi: tanpa reportGroup, akun 5101 (report_group COGS, kode di luar
    // 5000–5099) terhitung sebagai Beban Operasional → HPP 0 dan Laba Kotor sama
    // dengan Pendapatan.
    mocks.accountFindMany.mockResolvedValue([
      { id: 1, code: "400001", name: "Penjualan", type: "REVENUE", reportGroup: "REVE" },
      { id: 2, code: "5101", name: "Beban Pokok Penjualan", type: "EXPENSE", reportGroup: "COGS" },
      { id: 3, code: "600004", name: "Beban Gaji", type: "EXPENSE", reportGroup: "EXPS" },
    ])
    mocks.sumEntriesByAccount.mockResolvedValue(
      new Map([
        [1, { debit: 0, credit: 100_000_000 }],
        [2, { debit: 60_000_000, credit: 0 }],
        [3, { debit: 5_000_000, credit: 0 }],
      ]),
    )

    const report = await loadIncomeStatementByCostCenter({ costCenterId: 7, ...PERIOD })

    const hpp = report.table.rows.find((row) => row.kind === "line" && row.name === "Beban Pokok Penjualan")
    expect(hpp).toMatchObject({ values: ["60.000.000"] })

    const labaKotor = report.table.rows.find((row) => row.kind === "total" && row.label === "Laba Kotor")
    expect(labaKotor).toMatchObject({ values: ["40.000.000"] })

    const labaBersih = report.table.rows.at(-1)
    expect(labaBersih).toMatchObject({ kind: "grand", label: "Laba Bersih", values: ["35.000.000"] })
    expect(report.totals.totalCogs).toBe(60_000_000)
  })

  it("memfilter jurnal pada pusat biaya terpilih beserta sub-pusatnya", async () => {
    // Anak pusat biaya bergantung pada induknya — 7 → {8, 9}, 8 → {}, 9 → {}.
    mocks.costCenterFindMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { parentId: number } }).where
      return where.parentId === 7 ? [{ id: 8 }, { id: 9 }] : []
    })
    mocks.accountFindMany.mockResolvedValue([
      { id: 1, code: "400001", name: "Penjualan", type: "REVENUE", reportGroup: "REVE" },
    ])
    mocks.sumEntriesByAccount.mockResolvedValue(new Map([[1, { debit: 0, credit: 1_000 }]]))

    const report = await loadIncomeStatementByCostCenter({ costCenterId: 7, ...PERIOD })

    expect(mocks.sumEntriesByAccount.mock.calls[0][0]).toMatchObject({
      costCenterIds: [7, 8, 9],
      date: { gte: PERIOD.start, lte: PERIOD.end },
    })
    expect(report.costCenterLabel).toBe("CC-01 — Bengkel")
  })

  it("berhenti walau data pusat biaya melingkar (A induk B, B induk A)", async () => {
    // Tanpa pelindung siklus, penelusuran ini berjalan tanpa henti sampai
    // prosesnya kehabisan memori — bukan gagal secara terlihat, tapi menghukum
    // seluruh worker.
    mocks.costCenterFindMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where: { parentId: number } }).where
      if (where.parentId === 7) return [{ id: 8 }]
      if (where.parentId === 8) return [{ id: 7 }]
      return []
    })

    const report = await loadIncomeStatementByCostCenter({ costCenterId: 7, ...PERIOD })

    expect(mocks.sumEntriesByAccount.mock.calls[0][0].costCenterIds).toEqual([7, 8])
    expect(report.costCenterLabel).toBe("CC-01 — Bengkel")
  })

  it("menampilkan catatan, bukan error, ketika pusat biaya belum dipilih", async () => {
    const report = await loadIncomeStatementByCostCenter({ costCenterId: null, ...PERIOD })

    expect(report.costCenterLabel).toBeNull()
    expect(report.table.rows).toHaveLength(1)
    expect(report.table.rows[0]).toMatchObject({ kind: "notice" })
    expect(report.totals.netProfit).toBe(0)
    // Tanpa pusat biaya, tidak ada query jurnal yang dijalankan.
    expect(mocks.sumEntriesByAccount).not.toHaveBeenCalled()
  })
})

describe("drill-down Buku Besar F-2026-10-20-30 (data)", () => {
  it("slug akun dari loader menjadi href baris neraca; tanpa lineLink polos", async () => {
    mocks.accountFindMany.mockResolvedValue([{ ...ASSET_ACCOUNT, slug: "kas" }])
    mocks.sumEntriesByAccount.mockResolvedValue(new Map([[1, { debit: 1_000_000, credit: 0 }]]))

    const linked = await loadBalanceSheetStatement(new Date(2026, 9, 31), DEFAULT_STATEMENT_OPTIONS, {
      basePath: "/laporan/buku-besar",
      periodSlug: "2026-10",
    })
    const line = linked.table.rows.find((row) => row.kind === "line")
    expect(line?.kind === "line" ? line.href : null).toBe("/laporan/buku-besar/2026-10/akun/kas")

    const plain = await loadBalanceSheetStatement(new Date(2026, 9, 31), DEFAULT_STATEMENT_OPTIONS)
    const plainLine = plain.table.rows.find((row) => row.kind === "line")
    expect(plainLine?.kind === "line" ? plainLine.href : "ada").toBeUndefined()
  })
})

import { describe, expect, it } from "vitest"

import {
  assetJournalKind,
  buildAssetJournal,
  isAssetJournalReference,
  type AssetJournalInput,
} from "@/lib/reports/asset-journal"

const assets = new Map([
  [1, { code: "AST-001", name: "Forklift" }],
  [2, { code: "AST-002", name: "Kompresor" }],
])

function journal(over: Partial<AssetJournalInput> = {}): AssetJournalInput {
  return {
    id: 1,
    journalNumber: "JU-0001",
    date: new Date("2026-10-05T00:00:00"),
    referenceType: "ASSET_ACQUISITION",
    referenceId: 1,
    description: null,
    lines: [
      { accountCode: "1310", accountName: "Aset Tetap", debit: 10_000_000, credit: 0 },
      { accountCode: "1101", accountName: "Kas", debit: 0, credit: 10_000_000 },
    ],
    ...over,
  }
}

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

describe("jenis jurnal aset", () => {
  it("mengenali ketiga referenceType jurnal aset", () => {
    expect(isAssetJournalReference("ASSET_ACQUISITION")).toBe(true)
    expect(isAssetJournalReference("ASSET_DISPOSAL")).toBe(true)
    expect(isAssetJournalReference("ASSET_DEPRECIATION_202610")).toBe(true)
    expect(isAssetJournalReference("SALES_INVOICE")).toBe(false)
    expect(isAssetJournalReference("")).toBe(false)
  })

  it("mengenali penyusutan lewat AWALAN, bukan kesamaan", () => {
    // referenceType penyusutan memuat periode (jurnal unik pada
    // referenceType+referenceId), jadi penyaringan dengan kesamaan akan
    // membuat laporan kosong sejak bulan kedua.
    expect(assetJournalKind("ASSET_DEPRECIATION_202610")).toBe("Penyusutan")
    expect(assetJournalKind("ASSET_DEPRECIATION_202611")).toBe("Penyusutan")
    expect(assetJournalKind("ASSET_DEPRECIATION")).toBeNull()
  })
})

describe("buildAssetJournal", () => {
  it("satu blok per jurnal, baris akun di bawahnya, dan jumlah akhir", () => {
    const result = buildAssetJournal({ journals: [journal()], assets, start: period.start, end: period.end })

    const groups = result.table.rows.filter((row) => row.kind === "group")
    expect(groups).toHaveLength(1)
    expect(String(groups[0].label)).toContain("JU-0001")
    expect(String(groups[0].label)).toContain("Perolehan")
    expect(String(groups[0].label)).toContain("AST-001 Forklift")

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data).toHaveLength(2)
    // Akun diurutkan menaik: 1101 Kas sebelum 1310 Aset Tetap.
    expect(data[0].cells?.[1]).toContain("1101")
    expect(data[1].cells?.[1]).toContain("1310")

    expect(result.journalCount).toBe(1)
    expect(result.totalDebit).toBe(10_000_000)
    expect(result.totalCredit).toBe(10_000_000)
    expect(result.isBalanced).toBe(true)
  })

  it("meringkas jumlah dan nilai per jenis jurnal", () => {
    const result = buildAssetJournal({
      journals: [
        journal(),
        journal({ id: 2, journalNumber: "JU-0002", referenceType: "ASSET_DEPRECIATION_202610", referenceId: 2 }),
        journal({ id: 3, journalNumber: "JU-0003", referenceType: "ASSET_DEPRECIATION_202611", referenceId: 2 }),
        journal({ id: 4, journalNumber: "JU-0004", referenceType: "ASSET_DISPOSAL", referenceId: 1 }),
      ],
      assets,
      start: period.start,
      end: period.end,
    })

    expect(result.byKind).toEqual([
      { kind: "Pelepasan", count: 1, amount: 10_000_000 },
      { kind: "Penyusutan", count: 2, amount: 20_000_000 },
      { kind: "Perolehan", count: 1, amount: 10_000_000 },
    ])
  })

  it("memberi catatan bila debit dan kredit tidak seimbang", () => {
    const result = buildAssetJournal({
      journals: [
        journal({
          lines: [
            { accountCode: "1310", accountName: "Aset Tetap", debit: 10_000_000, credit: 0 },
            { accountCode: "1101", accountName: "Kas", debit: 0, credit: 9_000_000 },
          ],
        }),
      ],
      assets,
      start: period.start,
      end: period.end,
    })

    expect(result.isBalanced).toBe(false)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("tidak sama"))).toBe(true)
  })

  it("periode tanpa jurnal aset menghasilkan catatan, bukan tabel kosong tanpa penjelasan", () => {
    const result = buildAssetJournal({ journals: [], assets, start: period.start, end: period.end })
    expect(result.journalCount).toBe(0)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("Tidak ada jurnal aset"))).toBe(true)
  })

  it("jurnal tanpa aset yang cocok tetap ditampilkan tanpa mengarang nama", () => {
    const result = buildAssetJournal({
      journals: [journal({ referenceId: 99 })],
      assets,
      start: period.start,
      end: period.end,
    })
    const group = result.table.rows.find((row) => row.kind === "group")
    expect(String(group?.label)).toContain("Tanpa aset")
  })
})

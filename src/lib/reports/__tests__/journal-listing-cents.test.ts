import { describe, expect, it } from "vitest"

import { buildAssetJournal, type AssetJournalInput } from "@/lib/reports/asset-journal"
import { buildJobOrderJournal, type JobOrderJournalInput } from "@/lib/reports/job-order-journal"
import { buildJournalListing, type JournalListingInput } from "@/lib/reports/journal-listing"

// 17 x 0.24 float mentah = 4.080000000000002. Total jurnal sen WAJIB persis.
function centsJournals(): JournalListingInput[] {
  return Array.from({ length: 17 }, (_, i) => ({
    id: i + 1,
    journalNumber: `JU-${String(i + 1).padStart(4, "0")}`,
    date: new Date("2026-10-05T00:00:00"),
    title: `JU-${i + 1}`,
    description: null,
    lines: [
      { accountCode: "1101", accountName: "Kas", debit: 0.24, credit: 0 },
      { accountCode: "4101", accountName: "Pendapatan", debit: 0, credit: 0.24 },
    ],
  }))
}

describe("journal-listing presisi sen", () => {
  it("total debit/kredit 17 jurnal x 0.24 persis 4.08 dan seimbang", () => {
    const r = buildJournalListing({ journals: centsJournals(), emptyNotice: "kosong" })
    expect(r.totalDebit).toBe(4.08)
    expect(r.totalCredit).toBe(4.08)
    expect(r.isBalanced).toBe(true)
  })

  it("ringkasan aset per jenis persis sen", () => {
    const journals: AssetJournalInput[] = centsJournals().map((j) => ({
      id: j.id,
      journalNumber: j.journalNumber,
      date: j.date,
      referenceType: "ASSET_ACQUISITION",
      referenceId: 1,
      description: null,
      lines: j.lines,
    }))
    const r = buildAssetJournal({ journals, assets: new Map(), start: new Date(0), end: new Date() })
    expect(r.byKind).toEqual([{ kind: "Perolehan", count: 17, amount: 4.08 }])
    expect(r.totalDebit).toBe(4.08)
  })

  it("ringkasan pekerjaan per referensi persis sen", () => {
    const journals: JobOrderJournalInput[] = centsJournals().map((j) => ({
      id: j.id,
      journalNumber: j.journalNumber,
      date: j.date,
      referenceType: "MaterialIssue",
      jobLabel: "WO-1",
      description: null,
      lines: j.lines,
    }))
    const r = buildJobOrderJournal({ journals })
    expect(r.byReference[0]?.amount).toBe(4.08)
    expect(r.totalDebit).toBe(4.08)
  })
})

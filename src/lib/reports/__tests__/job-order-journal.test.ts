import { describe, expect, it } from "vitest"

import {
  buildJobOrderJournal,
  isJobJournalReference,
  jobJournalBaseReference,
  jobJournalLabel,
  type JobOrderJournalInput,
} from "@/lib/reports/job-order-journal"

function journal(over: Partial<JobOrderJournalInput> = {}): JobOrderJournalInput {
  return {
    id: 1,
    journalNumber: "JU-0001",
    date: new Date("2026-10-10T00:00:00"),
    referenceType: "MaterialIssue",
    jobLabel: "WO-0001",
    description: null,
    lines: [
      { accountCode: "5101", accountName: "Beban Bahan", debit: 3_000_000, credit: 0 },
      { accountCode: "1301", accountName: "Persediaan", debit: 0, credit: 3_000_000 },
    ],
    ...over,
  }
}

describe("referenceType jurnal pekerjaan", () => {
  it("mengenali lima pemicu jurnal alur produksi", () => {
    for (const reference of [
      "ProductionOrder",
      "ProductionOrderMaterialIssue",
      "ProductionOrderCostVariance",
      "ProductionCost",
      "MaterialIssue",
    ]) {
      expect(isJobJournalReference(reference)).toBe(true)
      expect(jobJournalLabel(reference)).toBeTruthy()
    }
    expect(isJobJournalReference("SALES_INVOICE")).toBe(false)
    expect(jobJournalLabel("SALES_INVOICE")).toBeNull()
  })

  it("jurnal per-rilis parsial (suffix stockMoveId) dinormalisasi ke jenis dasar", () => {
    expect(jobJournalBaseReference("ProductionOrder_456")).toBe("ProductionOrder")
    expect(jobJournalBaseReference("ProductionOrderCostVariance_456")).toBe(
      "ProductionOrderCostVariance",
    )
    expect(jobJournalBaseReference("ProductionOrder")).toBe("ProductionOrder")
    expect(isJobJournalReference("ProductionOrder_456")).toBe(true)
    expect(jobJournalLabel("ProductionOrder_456")).toBe("Penyelesaian Produksi")
    expect(jobJournalLabel("ProductionOrderCostVariance_456")).toBe("Selisih Biaya Produksi")

    const result = buildJobOrderJournal({
      journals: [
        journal({ id: 2, journalNumber: "JU-0002", referenceType: "ProductionOrder_456", jobLabel: "WO-0001" }),
        journal({ id: 3, journalNumber: "JU-0003", referenceType: "ProductionOrder_457", jobLabel: "WO-0001" }),
      ],
    })
    expect(result.byReference).toEqual([
      { referenceType: "ProductionOrder", label: "Penyelesaian Produksi", count: 2, amount: 6_000_000 },
    ])
  })
})

describe("buildJobOrderJournal", () => {
  it("judul blok memuat tanggal, nomor, jenis dokumen, dan nomor pekerjaan", () => {
    const result = buildJobOrderJournal({ journals: [journal()] })

    const group = result.table.rows.find((row) => row.kind === "group")
    expect(String(group?.label)).toContain("JU-0001")
    expect(String(group?.label)).toContain("Pengeluaran Bahan")
    expect(String(group?.label)).toContain("WO-0001")

    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data).toHaveLength(2)
    expect(data[0].cells?.[1]).toContain("1301")

    const total = result.table.rows.find((row) => row.kind === "total")
    expect(total?.cells?.[2]).toBe("3.000.000")
    expect(total?.cells?.[3]).toBe("3.000.000")
    expect(result.isBalanced).toBe(true)
  })

  it("jurnal yang pekerjaannya tidak terlacak tetap tampil, bukan disembunyikan", () => {
    const result = buildJobOrderJournal({
      journals: [journal({ referenceType: "ProductionOrderCostVariance", jobLabel: null })],
    })

    const group = result.table.rows.find((row) => row.kind === "group")
    expect(String(group?.label)).toContain("Selisih Biaya Produksi")
    expect(String(group?.label)).toContain("Tanpa pekerjaan")
    expect(result.journalCount).toBe(1)
  })

  it("meringkas jumlah dan nilai per jenis dokumen pemicu", () => {
    const result = buildJobOrderJournal({
      journals: [
        journal(),
        journal({ id: 2, journalNumber: "JU-0002", referenceType: "ProductionOrder", jobLabel: "WO-0001" }),
        journal({ id: 3, journalNumber: "JU-0003", referenceType: "ProductionOrder", jobLabel: "WO-0002" }),
      ],
    })

    expect(result.byReference).toEqual([
      { referenceType: "MaterialIssue", label: "Pengeluaran Bahan", count: 1, amount: 3_000_000 },
      { referenceType: "ProductionOrder", label: "Penyelesaian Produksi", count: 2, amount: 6_000_000 },
    ])
  })

  it("memberi catatan bila debit dan kredit tidak seimbang", () => {
    const result = buildJobOrderJournal({
      journals: [
        journal({
          lines: [
            { accountCode: "5101", accountName: "Beban Bahan", debit: 3_000_000, credit: 0 },
            { accountCode: "1301", accountName: "Persediaan", debit: 0, credit: 2_500_000 },
          ],
        }),
      ],
    })

    expect(result.isBalanced).toBe(false)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("tidak sama"))).toBe(true)
  })

  it("periode tanpa jurnal pekerjaan menghasilkan catatan", () => {
    const result = buildJobOrderJournal({ journals: [] })
    expect(result.journalCount).toBe(0)
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("Tidak ada jurnal pekerjaan"))).toBe(true)
  })
})

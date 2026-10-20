import { describe, expect, it } from "vitest"

import { buildPeriodCloseChecks, type PeriodCloseCounts } from "@/lib/settings/period-close"

function counts(overrides: Partial<PeriodCloseCounts> = {}): PeriodCloseCounts {
  return {
    draftJournals: 0,
    draftSalesInvoices: 0,
    draftVendorBills: 0,
    unfinishedReconciliations: 0,
    unverifiedGoodsReceipts: 0,
    unmatchedStatementLines: 0,
    draftPayrolls: 0,
    negativeStockItems: 0,
    ...overrides,
  }
}

const CLOSING = new Date("2026-09-30T23:59:59")

function build(overrides: Partial<PeriodCloseCounts> = {}, lockDate: Date | null = null) {
  return buildPeriodCloseChecks({
    monthLabel: "September 2026",
    closingDate: CLOSING,
    currentLockDate: lockDate,
    counts: counts(overrides),
  })
}

describe("buildPeriodCloseChecks", () => {
  it("menyatakan siap bila tidak ada temuan", () => {
    const result = build()

    expect(result.warningCount).toBe(0)
    expect(result.checks.every((check) => check.status === "ok")).toBe(true)
    expect(result.verdict).toContain("siap ditutup")
  })

  it("menandai temuan dan menyebut konsekuensinya, bukan hanya jumlahnya", () => {
    const result = build({ draftJournals: 3 })

    const journals = result.checks.find((check) => check.key === "draftJournals")
    expect(journals?.status).toBe("warn")
    expect(journals?.count).toBe(3)
    expect(journals?.guidance).toContain("tidak bisa lagi diposting")
    expect(result.verdict).toContain("1 hal perlu diperiksa")
  })

  it("menghitung beberapa temuan sekaligus", () => {
    const result = build({ draftJournals: 1, draftVendorBills: 2, negativeStockItems: 4 })

    expect(result.warningCount).toBe(3)
    expect(result.checks.find((c) => c.key === "negativeStockItems")?.status).toBe("warn")
    expect(result.checks.find((c) => c.key === "draftPayrolls")?.status).toBe("ok")
  })

  it("membedakan status kunci periode", () => {
    expect(build({}, null).lockState).toBe("open")

    const sameMonth = build({}, new Date("2026-09-30T23:59:59"))
    expect(sameMonth.lockState).toBe("this-month")
    expect(sameMonth.alreadyClosed).toBe(true)

    const beyond = build({}, new Date("2026-11-30T23:59:59"))
    expect(beyond.lockState).toBe("beyond")
    expect(beyond.alreadyClosed).toBe(true)

    const before = build({}, new Date("2026-06-30T23:59:59"))
    expect(before.lockState).toBe("before")
    // Kunci lama masih di belakang bulan ini: menutup bulan ini tetap memajukan kunci.
    expect(before.alreadyClosed).toBe(false)
  })

  it("menampilkan tanggal kunci sebagai YYYY-MM-DD lokal, bukan ISO UTC", () => {
    const result = build({}, new Date("2026-06-30T23:59:59"))

    expect(result.currentLockDate).toBe("2026-06-30")
  })

  it("menandai penerimaan belum terverifikasi dan baris koran belum cocok (F-25a)", () => {
    const result = build({ unverifiedGoodsReceipts: 2, unmatchedStatementLines: 5 })

    const receipts = result.checks.find((check) => check.key === "unverifiedGoodsReceipts")
    expect(receipts?.status).toBe("warn")
    expect(receipts?.count).toBe(2)
    expect(receipts?.guidance).toContain("belum masuk stok")

    const lines = result.checks.find((check) => check.key === "unmatchedStatementLines")
    expect(lines?.status).toBe("warn")
    expect(lines?.count).toBe(5)
    expect(result.warningCount).toBe(2)
  })

  it("penerimaan/baris bersih tidak menambah peringatan (F-25a)", () => {
    const result = build({ unverifiedGoodsReceipts: 0, unmatchedStatementLines: 0 })

    expect(result.checks.find((check) => check.key === "unverifiedGoodsReceipts")?.status).toBe("ok")
    expect(result.checks.find((check) => check.key === "unmatchedStatementLines")?.status).toBe("ok")
    expect(result.warningCount).toBe(0)
  })
})

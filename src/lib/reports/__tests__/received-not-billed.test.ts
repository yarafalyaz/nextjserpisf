import { describe, expect, it } from "vitest"

import {
  ageInDays,
  buildReceivedNotBilled,
  receivedNotBilledSummary,
} from "@/lib/reports/received-not-billed"

const asOf = new Date("2026-10-31T00:00:00.000Z")

function line(overrides: Partial<Parameters<typeof buildReceivedNotBilled>[0]["lines"][number]> = {}) {
  return {
    goodsReceiptId: 1,
    receiptNo: "GR-1",
    receiptDate: new Date("2026-10-10T00:00:00.000Z"),
    vendorName: "CV Sumber",
    sku: "BRG-1",
    name: "Busi",
    receivedQty: 10,
    unitCost: 1000,
    billedValue: 0,
    ...overrides,
  }
}

function detailText(result: ReturnType<typeof buildReceivedNotBilled>) {
  return result.detail.rows
    .map((row) =>
      row.kind === "group" || row.kind === "total"
        ? `${row.label}`
        : row.kind === "notice"
          ? row.text
          : row.cells.join(" | "),
    )
    .join("\n")
}

function noticeTexts(result: ReturnType<typeof buildReceivedNotBilled>) {
  return result.detail.rows.filter((row) => row.kind === "notice").map((row) => row.text)
}

describe("ageInDays", () => {
  it("menghitung umur dan tidak pernah negatif untuk tanggal di masa depan", () => {
    expect(ageInDays(new Date("2026-10-01T00:00:00.000Z"), asOf)).toBe(30)
    expect(ageInDays(new Date("2026-11-20T00:00:00.000Z"), asOf)).toBe(0)
  })
})

describe("buildReceivedNotBilled", () => {
  it("menghitung sisa per baris dan totalnya, serta umur per penerimaan", () => {
    const result = buildReceivedNotBilled({
      lines: [line({ billedValue: 4_000 })],
      ledger: { accountLabel: "2-1300 GRNI", balance: 6_000 },
      asOf,
      periodEndIsToday: true,
    })

    expect(result.totals.outstandingValue).toBe(6_000)
    expect(result.totals.receivedValue).toBe(10_000)
    expect(result.totals.billedValue).toBe(4_000)
    expect(result.totals.receipts).toBe(1)
    expect(result.totals.lines).toBe(1)
    expect(detailText(result)).toContain("umur 21 hari")
    expect(detailText(result)).toContain("Sisa GR-1")
  })

  it("membuang penerimaan yang sudah ditagih penuh", () => {
    const result = buildReceivedNotBilled({
      lines: [line({ billedValue: 10_000 })],
      ledger: null,
      asOf,
      periodEndIsToday: true,
    })

    expect(result.totals.receipts).toBe(0)
    expect(result.totals.outstandingValue).toBe(0)
    expect(detailText(result)).toContain("Tidak ada penerimaan barang yang belum ditagih")
  })

  it("mengelompokkan sisa menurut umur", () => {
    const result = buildReceivedNotBilled({
      lines: [
        line({ goodsReceiptId: 1, receiptNo: "GR-1", receiptDate: new Date("2026-10-20T00:00:00.000Z") }),
        line({ goodsReceiptId: 2, receiptNo: "GR-2", receiptDate: new Date("2026-08-01T00:00:00.000Z") }),
      ],
      ledger: null,
      asOf,
      periodEndIsToday: true,
    })

    const muda = result.aging.find((bucket) => bucket.label === "0–30 hari")
    const tua = result.aging.find((bucket) => bucket.label === "Lebih dari 90 hari")

    expect(muda?.value).toBe(10_000)
    expect(muda?.receipts).toBe(1)
    expect(tua?.value).toBe(10_000)
    expect(tua?.receipts).toBe(1)
  })

  it("TIDAK menampilkan nol saat akun GRNI belum dipetakan", () => {
    const result = buildReceivedNotBilled({
      lines: [line()],
      ledger: null,
      asOf,
      periodEndIsToday: true,
    })
    const sel = result.detail.rows
      .filter((row) => row.kind === "data")
      .map((row) => (row.kind === "data" ? row.cells[3] : ""))

    expect(result.totals.ledgerBalance).toBeNull()
    expect(result.totals.difference).toBeNull()
    expect(result.totals.isBalanced).toBe(false)
    // Kolom nilai tetap menampilkan sisa dokumen — yang tidak boleh muncul adalah
    // angka akun palsu "0" yang terbaca seolah sudah cocok.
    expect(sel.every((cell) => cell !== "0")).toBe(true)
    expect(noticeTexts(result).join(" ")).toContain("belum dipetakan")
    expect(noticeTexts(result).join(" ")).toContain("tidak menampilkan 0")
    expect(receivedNotBilledSummary(result)).toContain("belum dipetakan")
  })

  it("menyebut selisih beserta arah dan sebab yang paling sering", () => {
    const result = buildReceivedNotBilled({
      lines: [line()],
      ledger: { accountLabel: "2-1300 GRNI", balance: 12_000 },
      asOf,
      periodEndIsToday: true,
    })

    expect(result.totals.difference).toBe(2_000)
    expect(result.totals.isBalanced).toBe(false)
    expect(result.verdict).toContain("2.000")
    const notices = noticeTexts(result).join(" ")
    expect(notices).toContain("buku besar lebih besar")
    expect(notices).toContain("ongkos angkut")
  })

  it("total uang presisi sen: 10 baris Rp10.000.000,10 tidak drift float", () => {
    const cents = 10_000_000.10
    const result = buildReceivedNotBilled({
      lines: Array.from({ length: 10 }, (_, i) =>
        line({ goodsReceiptId: i + 1, receiptNo: `GR-${i + 1}`, receivedQty: 1, unitCost: cents, billedValue: 0 }),
      ),
      ledger: { accountLabel: "2-1300 GRNI", balance: 100_000_001 },
      asOf,
      periodEndIsToday: true,
    })

    // Tanpa safe-math: akumulasi 10000000.1 x10 di-float = 100000000.99999999.
    expect(result.totals.receivedValue).toBe(100_000_001)
    expect(result.totals.outstandingValue).toBe(100_000_001)
    expect(result.totals.difference).toBe(0)
    expect(result.totals.isBalanced).toBe(true)
  })

  it("menyatakan cocok dan memberi catatan tautan tagihan manual", () => {
    const result = buildReceivedNotBilled({
      lines: [line()],
      ledger: { accountLabel: "2-1300 GRNI", balance: 10_000 },
      asOf,
      periodEndIsToday: true,
    })

    expect(result.totals.isBalanced).toBe(true)
    expect(noticeTexts(result).join(" ")).toContain("tidak ada selisih")
    expect(noticeTexts(result).join(" ")).toContain("2-1300 GRNI")
    expect(noticeTexts(result).join(" ")).toContain("tanpa tautan")
    expect(receivedNotBilledSummary(result)).toContain("cocok dengan akun GRNI")
  })
})

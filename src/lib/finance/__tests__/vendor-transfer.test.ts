import { describe, expect, it } from "vitest"

import { normalizeTransferSelection, splitInstructions, transferSummary } from "@/lib/finance/vendor-transfer"

describe("splitInstructions", () => {
  it("memisahkan yang menunggu dan yang sudah ditransfer beserta totalnya", () => {
    const result = splitInstructions([
      { vendorName: "A", amount: 1_000_000, transferredAt: null },
      { vendorName: "B", amount: 2_000_000, transferredAt: new Date("2026-10-01") },
      { vendorName: "C", amount: 500_000, transferredAt: null },
    ])

    expect(result.pending).toHaveLength(2)
    expect(result.transferred).toHaveLength(1)
    expect(result.pendingAmount).toBe(1_500_000)
    expect(result.transferredAmount).toBe(2_000_000)
  })

  it("total presisi sen tanpa float drift", () => {
    const result = splitInstructions([
      { vendorName: "A", amount: 10_000_000.1, transferredAt: null },
      { vendorName: "B", amount: 10_000_000.1, transferredAt: null },
      { vendorName: "C", amount: 10_000_000.1, transferredAt: null },
    ])
    expect(result.pendingAmount).toBe(30_000_000.3)
  })
})

describe("normalizeTransferSelection", () => {
  it("mengambil id unik yang sah dan membuang yang tidak masuk akal", () => {
    const result = normalizeTransferSelection(["3", "3", " 5 ", "abc", "-1", "0"])

    expect(result.ids).toEqual([3, 5])
    expect(result.error).toBeUndefined()
  })

  it("menolak pilihan kosong dengan pesan, bukan diam-diam tidak melakukan apa pun", () => {
    const result = normalizeTransferSelection([])

    expect(result.ids).toEqual([])
    expect(result.error).toContain("Pilih minimal satu")
  })

  it("menolak ID non-desimal murni (0x10/1e3/0b101/+10/10.0) — bukan ID pembayaran 5/10/16/1000", () => {
    const result = normalizeTransferSelection(["0x10", "1e3", "0b101", "+10", "10.0"])

    expect(result.ids).toEqual([])
    expect(result.error).toContain("Pilih minimal satu")
  })

  it("spasi di sekitar angka tetap diterima (trim pola existing)", () => {
    const result = normalizeTransferSelection([" 10 "])

    expect(result.ids).toEqual([10])
    expect(result.error).toBeUndefined()
  })
})

describe("transferSummary", () => {
  it("membedakan tidak ada antrian dari ada antrian", () => {
    expect(transferSummary(0, 0)).toContain("Tidak ada pembayaran")
    expect(transferSummary(2, 3_000_000)).toContain("2 pembayaran menunggu transfer")
  })
})

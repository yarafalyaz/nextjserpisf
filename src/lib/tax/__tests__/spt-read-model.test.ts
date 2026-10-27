import { describe, it, expect } from "vitest"

import {
  buildOutputSptRows,
  buildInputSptRows,
  buildReturnDeductionRows,
  withLegacyFallback,
  netVatForPeriod,
} from "@/lib/tax/spt-read-model"

describe("SPT keluaran: hanya kepala rantai bernilai, masa asal", () => {
  it("pengganti mengubah PPN — SPT masa asal berubah, masa terbit tidak dobel", () => {
    const rows = buildOutputSptRows([
      {
        originPeriod: "2026-01",
        chain: [
          { id: 1, djpStatus: "replaced", dpp: 11_000_000, taxAmount: 1_320_000 },
          { id: 2, djpStatus: "approved", dpp: 5_500_000, taxAmount: 660_000 },
        ],
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].period).toBe("2026-01")
    expect(rows[0].vat).toBe(660_000)
    expect(rows[0].dpp).toBe(5_500_000)
    expect(rows[0].count).toBe(1)
  })

  it("rantai semua batal → tanpa baris", () => {
    const rows = buildOutputSptRows([
      { originPeriod: "2026-01", chain: [{ id: 1, djpStatus: "cancelled", dpp: 100, taxAmount: 12 }] },
    ])
    expect(rows).toHaveLength(0)
  })

  it("rejected: kepala ditolak DJP tidak menambah PPN Keluaran", () => {
    const rows = buildOutputSptRows([
      { originPeriod: "2026-01", chain: [{ id: 1, djpStatus: "rejected", dpp: 11_000_000, taxAmount: 1_320_000 }] },
    ])
    expect(rows).toHaveLength(0)
  })

  it("draft: faktur belum ada bukti DJP tidak masuk posisi SPT", () => {
    const rows = buildOutputSptRows([
      { originPeriod: "2026-01", chain: [{ id: 1, djpStatus: "draft", dpp: 11_000_000, taxAmount: 1_320_000 }] },
    ])
    expect(rows).toHaveLength(0)
  })

  it("pengganti draft/rejected tidak menghidupkan faktur asal yang replaced", () => {
    const draft = buildOutputSptRows([
      {
        originPeriod: "2026-01",
        chain: [
          { id: 1, djpStatus: "replaced", dpp: 11_000_000, taxAmount: 1_320_000 },
          { id: 2, djpStatus: "draft", dpp: 5_500_000, taxAmount: 660_000 },
        ],
      },
    ])
    expect(draft).toHaveLength(0)
    const rejected = buildOutputSptRows([
      {
        originPeriod: "2026-01",
        chain: [
          { id: 1, djpStatus: "replaced", dpp: 11_000_000, taxAmount: 1_320_000 },
          { id: 2, djpStatus: "rejected", dpp: 5_500_000, taxAmount: 660_000 },
        ],
      },
    ])
    expect(rejected).toHaveLength(0)
  })
})

describe("SPT masukan: masa kredit, hanya credited", () => {
  it("credited masuk masa creditPeriod; uncredited/expired/not_creditable tidak", () => {
    const rows = buildInputSptRows([
      { taxPeriod: "2026-01", creditPeriod: "2026-03", creditStatus: "credited", dpp: 1000, taxAmount: 120 },
      { taxPeriod: "2026-01", creditPeriod: null, creditStatus: "uncredited", dpp: 1000, taxAmount: 120 },
      { taxPeriod: "2026-01", creditPeriod: "2026-05", creditStatus: "expired", dpp: 1000, taxAmount: 120 },
      { taxPeriod: "2026-01", creditPeriod: "2026-02", creditStatus: "not_creditable", dpp: 1000, taxAmount: 120 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].period).toBe("2026-03")
    expect(rows[0].vat).toBe(120)
  })

  it("batal-setelah-kredit: djpStatus cancelled tidak dikreditkan walau creditStatus masih credited", () => {
    const rows = buildInputSptRows([
      {
        taxPeriod: "2026-01",
        creditPeriod: "2026-01",
        creditStatus: "credited",
        dpp: 11_000_000,
        taxAmount: 1_320_000,
        djpStatus: "cancelled",
      },
    ])
    expect(rows).toHaveLength(0)
  })

  it("creditablePercent 50%: PPN 1.320.000 dikreditkan 660.000, bukan penuh", () => {
    const rows = buildInputSptRows([
      {
        taxPeriod: "2026-01",
        creditPeriod: "2026-01",
        creditStatus: "credited",
        dpp: 11_000_000,
        taxAmount: 1_320_000,
        djpStatus: "approved",
        creditablePercent: 50,
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].vat).toBe(660_000)
    expect(rows[0].dpp).toBe(5_500_000)
  })
})

describe("fallback legacy: per dokumen, bukan per masa", () => {
  // Perilaku lama membuang SEMUA legacy satu masa bila masa itu punya
  // 1 TaxInvoice (10 faktur Rp13,2 jt tampil Rp1,32 jt). Sekarang loader
  // meneruskan hanya dokumen komersial yang belum punya TaxInvoice, dan
  // barisnya ditambahkan ke masa yang sama berlabel `mixed`.
  it("masa campuran: TaxInvoice + legacy belum ber-TaxInvoice dijumlahkan", () => {
    const merged = withLegacyFallback(
      [{ period: "2026-01", dpp: 100, vat: 12, count: 1, source: "tax_invoice" as const }],
      [
        { period: "2026-01", dpp: 900, vat: 108, count: 9 },
        { period: "2026-02", dpp: 200, vat: 24, count: 2 },
      ],
    )
    expect(merged).toHaveLength(2)
    expect(merged.find((r) => r.period === "2026-01")).toMatchObject({ dpp: 1000, vat: 120, count: 10, source: "mixed" })
    expect(merged.find((r) => r.period === "2026-02")).toMatchObject({ vat: 24, source: "legacy" })
  })
})

describe("pengurang retur: snapshot vs legacy terhitung terpisah", () => {
  it("legacyCount menandai baris tanpa snapshot", () => {
    const { byPeriod } = buildReturnDeductionRows([
      { period: "2026-02", dpp: 100, vat: 12, snapshot: true },
      { period: "2026-02", dpp: 50, vat: 6, snapshot: false },
    ])
    expect(byPeriod[0]).toMatchObject({ dpp: 150, vat: 18, count: 2, legacyCount: 1 })
  })

  it("posisi neto = keluaran − retur − masukan", () => {
    expect(netVatForPeriod({ outputVat: 1320, returnVat: 120, inputVat: 600 })).toEqual({
      net: 600,
      kurangBayar: true,
    })
    expect(netVatForPeriod({ outputVat: 100, returnVat: 0, inputVat: 300 }).kurangBayar).toBe(false)
  })
})

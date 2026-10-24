import { describe, it, expect } from "vitest"

import {
  buildFiscalYearRows,
  fiscalDepreciationForYear,
} from "../asset-fiscal-balance"
import { fiscalGroupRule } from "../asset-fiscal-groups"

/**
 * Falsifikasi vonis BOT 4 F-2026-10-23-109-V (lapis aman builder,
 * subset F109-1/2/3/4/7/8/10 hitung murni). Cabut habis-sekaligus
 * tahun terakhir, fallback garis lurus, atau clamp nol dan tes MERAH.
 * Inti (F109-5 snapshot beku DB, F109-6 idempoten generate) = kartu inti.
 */

const GROUP_1 = fiscalGroupRule("GROUP_1")! // 4 th, GL 25%, SM 50%
const GROUP_2 = fiscalGroupRule("GROUP_2")! // 8 th, GL 12,5%, SM 25%
const BUILDING = fiscalGroupRule("BUILDING_PERMANENT")! // GL saja

const START = new Date(Date.UTC(2023, 5, 15)) // tahun mulai 2023

function rows(result: ReturnType<typeof buildFiscalYearRows>) {
  if (result.rows === null) throw new Error(`rows null: ${result.reason}`)
  return result.rows
}

describe("buildFiscalYearRows — saldo menurun P2 (F109-1, F109-2)", () => {
  it("F109-1: Kelompok 1 cost 12jt SM: th1 6jt, th2 3jt — BUKAN 3jt garis lurus sejak th1", () => {
    const r = rows(buildFiscalYearRows({
      purchaseCost: 12_000_000, fiscalMethod: "declining_balance",
      fiscalGroup: GROUP_1, purchaseDate: START, throughYear: 2027,
    }))
    expect(r.map((x) => x.depreciation.toFixed(2))).toEqual([
      "6000000.00", "3000000.00", "1500000.00", "1500000.00", "0.00",
    ])
    expect(r[0].closingBalance.toFixed(2)).toBe("6000000.00")
    expect(r[0].ratePercent.toFixed(2)).toBe("50.00")
  })

  it("F109-2: tahun terakhir masa manfaat disusutkan sekaligus ke 0; total = cost", () => {
    const r = rows(buildFiscalYearRows({
      purchaseCost: 12_000_000, fiscalMethod: "declining_balance",
      fiscalGroup: GROUP_1, purchaseDate: START, throughYear: 2026,
    }))
    // th1 50%, th2 25%, th3 12,5%, th4 sisa 12,5% sekaligus (Pasal 11(2)).
    expect(r[3].depreciation.toFixed(2)).toBe("1500000.00")
    expect(r[3].closingBalance.toFixed(2)).toBe("0.00")
    const total = r.reduce((sum, x) => sum.add(x.depreciation), r[0].depreciation.mul(0))
    expect(total.toFixed(2)).toBe("12000000.00")
  })

  it("garis lurus tidak berubah: cost x tarif GL sekali ke sen, berhenti di 0", () => {
    const r = rows(buildFiscalYearRows({
      purchaseCost: 12_000_000, fiscalMethod: "straight_line",
      fiscalGroup: GROUP_1, purchaseDate: START, throughYear: 2028,
    }))
    expect(r.map((x) => x.depreciation.toFixed(2))).toEqual([
      "3000000.00", "3000000.00", "3000000.00", "3000000.00", "0.00", "0.00",
    ])
    expect(r[5].closingBalance.toFixed(2)).toBe("0.00")
  })

  it("F109-7: saldo tidak pernah negatif walau tarif x saldo lewat sisa (sen ganjil)", () => {
    const r = rows(buildFiscalYearRows({
      purchaseCost: "100.01", fiscalMethod: "declining_balance",
      fiscalGroup: GROUP_2, purchaseDate: START, throughYear: 2040,
    }))
    for (const row of r) {
      expect(row.closingBalance.gte(0)).toBe(true)
      expect(row.depreciation.lte(row.openingBalance)).toBe(true)
    }
    expect(r[r.length - 1].closingBalance.toFixed(2)).toBe("0.00")
  })

  it("pembulatan sekali per tahun ke sen, bukan bulanan x12", () => {
    const r = rows(buildFiscalYearRows({
      purchaseCost: "1000000.01", fiscalMethod: "declining_balance",
      fiscalGroup: GROUP_2, purchaseDate: START, throughYear: 2023,
    }))
    // 1.000.000,01 x 25% = 250.000,0025 -> 250.000,00 sekali.
    expect(r[0].depreciation.toFixed(2)).toBe("250000.00")
  })
})

describe("buildFiscalYearRows — belum-dihitung jujur P1/P3/P5 (F109-3, F109-4, F109-8)", () => {
  const base = {
    purchaseCost: 12_000_000, fiscalGroup: GROUP_1,
    purchaseDate: START, throughYear: 2024,
  } as const

  it("F109-4: fiscalMethod null/kosong = metode-belum-dipilih, nol fallback garis lurus", () => {
    for (const fiscalMethod of [null, undefined, "", "  "]) {
      expect(buildFiscalYearRows({ ...base, fiscalMethod })).toEqual({
        rows: null, reason: "metode-belum-dipilih",
      })
    }
  })

  it("F109-3: bangunan saldo menurun ditolak; bangunan garis lurus sah", () => {
    expect(buildFiscalYearRows({
      ...base, fiscalGroup: BUILDING, fiscalMethod: "declining_balance",
    })).toEqual({ rows: null, reason: "bangunan-saldo-menurun" })
    expect(rows(buildFiscalYearRows({
      ...base, fiscalGroup: BUILDING, fiscalMethod: "straight_line",
    }))[0].depreciation.toFixed(2)).toBe("600000.00")
  })

  it("metode asing ditolak metode-tidak-sah", () => {
    expect(buildFiscalYearRows({ ...base, fiscalMethod: "units_of_production" }))
      .toEqual({ rows: null, reason: "metode-tidak-sah" })
  })

  it("F109-8: purchaseDate null = tanpa-tanggal-perolehan, bukan createdAt", () => {
    expect(buildFiscalYearRows({
      ...base, fiscalMethod: "straight_line", purchaseDate: null,
    })).toEqual({ rows: null, reason: "tanpa-tanggal-perolehan" })
  })
})

describe("rekonstruksi saldo pembuka P3 (F109-10) + tahun berjalan P5", () => {
  it("F109-10: mulai dari saldo pembuka berlabel opening; tahun sebelum pembuka tidak dikarang", () => {
    const r = rows(buildFiscalYearRows({
      purchaseCost: 12_000_000, fiscalMethod: "declining_balance",
      fiscalGroup: GROUP_1, purchaseDate: START, throughYear: 2026,
      openingBalance: "3000000.00", openingYear: 2025,
    }))
    expect(r.map((x) => x.taxYear)).toEqual([2025, 2026])
    expect(r[0].source).toBe("opening")
    expect(r[0].openingBalance.toFixed(2)).toBe("3000000.00")
    // 2026 = tahun ke-4 sejak 2023 = tahun terakhir: habis sekaligus.
    expect(r[1].depreciation.toFixed(2)).toBe("1500000.00")
    expect(r[1].closingBalance.toFixed(2)).toBe("0.00")
  })

  it("saldo pembuka sebelum tahun perolehan / negatif ditolak", () => {
    const base = {
      purchaseCost: 12_000_000, fiscalMethod: "straight_line",
      fiscalGroup: GROUP_1, purchaseDate: START, throughYear: 2026,
    } as const
    expect(buildFiscalYearRows({ ...base, openingBalance: 100, openingYear: 2022 }))
      .toEqual({ rows: null, reason: "saldo-pembuka-tidak-valid" })
    expect(buildFiscalYearRows({ ...base, openingBalance: -1, openingYear: 2025 }))
      .toEqual({ rows: null, reason: "saldo-pembuka-tidak-valid" })
  })

  it("tahun berjalan tanpa baris tertutup = estimasi-tahun-berjalan; baris tertutup dipakai apa adanya", () => {
    const base = {
      purchaseCost: 12_000_000, fiscalMethod: "declining_balance" as const,
      fiscalGroup: GROUP_1, purchaseDate: START,
    }
    const est = fiscalDepreciationForYear({ ...base, taxYear: 2024 })
    expect(est.depreciation?.toFixed(2)).toBe("3000000.00")
    if (est.depreciation) expect(est.source).toBe("estimasi-tahun-berjalan")

    const closed = rows(buildFiscalYearRows({ ...base, throughYear: 2024 }))
    const frozen = fiscalDepreciationForYear({ ...base, taxYear: 2024, closedRows: closed })
    expect(frozen.depreciation?.toFixed(2)).toBe("3000000.00")
    if (frozen.depreciation) expect(frozen.source).toBe("computed")
  })

  it("tahun sebelum mulai + metode null lewat jalur tahunan tetap null beralasan", () => {
    expect(fiscalDepreciationForYear({
      purchaseCost: 12_000_000, fiscalMethod: "straight_line",
      fiscalGroup: GROUP_1, purchaseDate: START, taxYear: 2022,
    })).toEqual({ depreciation: null, reason: "tahun-sebelum-mulai" })
    expect(fiscalDepreciationForYear({
      purchaseCost: 12_000_000, fiscalMethod: null,
      fiscalGroup: GROUP_1, purchaseDate: START, taxYear: 2024,
    })).toEqual({ depreciation: null, reason: "metode-belum-dipilih" })
  })
})

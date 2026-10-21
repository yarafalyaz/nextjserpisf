import { describe, it, expect, vi } from "vitest"
import {
  computePph21FinalPeriod,
  computePph21Monthly,
  computePph21Ter,
  findTerBracket,
  getTerBrackets,
  resolveTerPeriod,
  statusCodeDependents,
  terCategoryFor,
  type TerBracket,
} from "../payroll-statutory.service"

// F-2026-10-21-026: tes falsifikasi mengikat vonis accountant (backlog VONIS
// F-026 §6, T1-T7). Bracket fixture = baris seed migration (Lampiran PP
// 58/2023). CATATAN T6: vonis menulis tarif 18% untuk bruto 55.400.000, tetapi
// Lampiran A resmi: >47,8jt–51,4jt = 18%, >51,4jt–56,3jt = 19%. Tes memakai
// tabel resmi (19%) — eskalasi koreksi vonis tercatat di komentar task.
const A: [number | null, number][] = [
  [5_400_000, 0], [5_650_000, 250], [5_950_000, 500], [6_300_000, 750], [6_750_000, 1000],
  [7_500_000, 1250], [8_550_000, 1500], [9_650_000, 1750], [10_050_000, 2000], [10_350_000, 2250],
  [10_700_000, 2500], [11_050_000, 3000], [11_600_000, 3500], [12_500_000, 4000], [13_750_000, 5000],
  [15_100_000, 6000], [16_950_000, 7000], [19_750_000, 8000], [24_150_000, 9000], [26_450_000, 10000],
  [28_000_000, 11000], [30_050_000, 12000], [32_400_000, 13000], [35_400_000, 14000], [39_100_000, 15000],
  [43_850_000, 16000], [47_800_000, 17000], [51_400_000, 18000], [56_300_000, 19000], [62_200_000, 20000],
  [68_600_000, 21000], [77_500_000, 22000], [89_000_000, 23000], [103_000_000, 24000], [125_000_000, 25000],
  [157_000_000, 26000], [206_000_000, 27000], [337_000_000, 28000], [454_000_000, 29000], [550_000_000, 30000],
  [695_000_000, 31000], [910_000_000, 32000], [1_400_000_000, 33000], [null, 34000],
]
const B: [number | null, number][] = [
  [6_200_000, 0], [6_500_000, 250], [6_850_000, 500], [7_300_000, 750], [9_200_000, 1000],
  [10_750_000, 1500], [11_250_000, 2000], [11_600_000, 2500], [12_600_000, 3000], [13_600_000, 4000],
  [14_950_000, 5000], [16_400_000, 6000], [18_450_000, 7000], [21_850_000, 8000], [26_000_000, 9000],
  [27_700_000, 10000], [29_350_000, 11000], [31_450_000, 12000], [33_950_000, 13000], [37_100_000, 14000],
  [41_100_000, 15000], [45_800_000, 16000], [49_500_000, 17000], [53_800_000, 18000], [58_500_000, 19000],
  [64_000_000, 20000], [71_000_000, 21000], [80_000_000, 22000], [93_000_000, 23000], [109_000_000, 24000],
  [129_000_000, 25000], [163_000_000, 26000], [211_000_000, 27000], [374_000_000, 28000], [459_000_000, 29000],
  [555_000_000, 30000], [704_000_000, 31000], [957_000_000, 32000], [1_405_000_000, 33000], [null, 34000],
]
const C: [number | null, number][] = [
  [6_600_000, 0], [6_950_000, 250], [7_350_000, 500], [7_800_000, 750], [8_850_000, 1000],
  [9_800_000, 1250], [10_950_000, 1500], [11_200_000, 1750], [12_050_000, 2000], [12_950_000, 3000],
  [14_150_000, 4000], [15_550_000, 5000], [17_050_000, 6000], [19_500_000, 7000], [22_700_000, 8000],
  [26_600_000, 9000], [28_100_000, 10000], [30_100_000, 11000], [32_600_000, 12000], [35_400_000, 13000],
  [38_900_000, 14000], [43_000_000, 15000], [47_400_000, 16000], [51_200_000, 17000], [55_800_000, 18000],
  [60_400_000, 19000], [66_700_000, 20000], [74_500_000, 21000], [83_200_000, 22000], [95_600_000, 23000],
  [110_000_000, 24000], [134_000_000, 25000], [169_000_000, 26000], [221_000_000, 27000], [390_000_000, 28000],
  [463_000_000, 29000], [561_000_000, 30000], [709_000_000, 31000], [965_000_000, 32000], [1_419_000_000, 33000],
  [null, 34000],
]

function brackets(cat: "A" | "B" | "C", rows: [number | null, number][]): TerBracket[] {
  let prev = 0
  return rows.map(([upperBound, rateMilliPercent]) => {
    const b: TerBracket = {
      category: cat, lowerBound: prev, upperBound, rateMilliPercent,
      effectiveFrom: "2024-01-01", source: `PP 58/2023 Lampiran ${cat}`,
    }
    prev = upperBound ?? prev
    return b
  })
}
const terA = brackets("A", A)
const terB = brackets("B", B)
const terC = brackets("C", C)

describe("T1 kategori TER dari status+tanggungan (vonis §1/§6)", () => {
  it("memetakan kategori persis vonis, clamp 3, fail-closed A", () => {
    expect(terCategoryFor("TK/0", 0)).toBe("A")
    expect(terCategoryFor("Belum Kawin", 1)).toBe("A") // negasi = TK, bukan K
    expect(terCategoryFor("K/0", 0)).toBe("A")
    expect(terCategoryFor("Kawin", 1)).toBe("B")
    expect(terCategoryFor("Kawin", 2)).toBe("B")
    expect(terCategoryFor("TK/2", 2)).toBe("B")
    expect(terCategoryFor("Kawin", 3)).toBe("C")
    expect(terCategoryFor("Kawin", 9)).toBe("C") // clamp 3, bukan error
    expect(terCategoryFor(null, 0)).toBe("A")
    expect(terCategoryFor("status-aneh", 0)).toBe("A")
    // Kode K/n tidak menentukan tanggungan — kolom dependents menang.
    expect(terCategoryFor("K/3", 0)).toBe("A")
    expect(statusCodeDependents("K/3")).toBe(3)
    expect(statusCodeDependents("Menikah")).toBeNull()
  })

  it("angka persis T1", () => {
    expect(computePph21Ter(10_000_000, terA)).toMatchObject({ pph21: 200_000, ratePct: 2 })
    expect(computePph21Ter(10_000_000, terB)).toMatchObject({ pph21: 150_000, ratePct: 1.5 })
    expect(computePph21Ter(10_000_000, brackets("A", A))).toMatchObject({ pph21: 200_000 }) // K/0 -> A
    expect(computePph21Ter(6_500_000, terA)).toMatchObject({ pph21: 65_000, ratePct: 1 })
    expect(computePph21Ter(6_500_000, terC)).toMatchObject({ pph21: 0, ratePct: 0 })
  })

  it("batas bracket: bawah eksklusif, atas inklusif", () => {
    expect(findTerBracket(terA, 5_400_000)?.rateMilliPercent).toBe(0)
    expect(findTerBracket(terA, 5_400_001)?.rateMilliPercent).toBe(250)
    expect(findTerBracket(terA, 2_000_000_000)?.rateMilliPercent).toBe(34000)
  })
})

describe("T2 Desember karyawan penuh (contoh resmi Penjelasan PP 58/2023)", () => {
  it("PPh21 Desember = 515.000 persis", () => {
    const prior = 11 * computePph21Ter(10_000_000, terA).pph21
    expect(prior).toBe(2_200_000)
    const r = computePph21FinalPeriod({
      grossYear: 120_000_000, pensionDeductionYear: 1_200_000,
      maritalStatus: "K/0", dependents: 0, monthsInStint: 12,
      priorWithheld: prior, finalPeriodGross: 10_000_000,
    })
    expect(r).toMatchObject({ annualTax: 2_715_000, pkp: 54_300_000, pph21: 515_000, overWithheld: 0 })
  })
})

describe("T3 THR digabung bruto se-masa", () => {
  it("April melonjak bracket; Desember = 700.000", () => {
    expect(computePph21Ter(20_000_000, terA)).toMatchObject({ pph21: 1_800_000, ratePct: 9 })
    const prior = 3 * 200_000 + 1_800_000 + 7 * 200_000
    const r = computePph21FinalPeriod({
      grossYear: 130_000_000, pensionDeductionYear: 0,
      maritalStatus: "TK/0", dependents: 0, monthsInStint: 12,
      priorWithheld: prior, finalPeriodGross: 10_000_000,
    })
    expect(r).toMatchObject({ annualTax: 4_500_000, pph21: 700_000 })
  })
})

describe("T4 masuk tengah tahun (annualisasi proporsional Pasal 15 ayat (3))", () => {
  it("PPh21 Des = 500.000; tanpa annualisasi angka berbeda", () => {
    const r = computePph21FinalPeriod({
      grossYear: 60_000_000, pensionDeductionYear: 0,
      maritalStatus: "TK/0", dependents: 0, monthsInStint: 6,
      priorWithheld: 1_000_000, finalPeriodGross: 10_000_000,
    })
    expect(r).toMatchObject({ annualTax: 1_500_000, pkp: 60_000_000, pph21: 500_000 })
  })
})

describe("T5 keluar tengah tahun = masa terakhir bulan berhenti", () => {
  it("PPh21 Sep final = 650.000 (TER biasa 200.000 = merah)", () => {
    const r = computePph21FinalPeriod({
      grossYear: 90_000_000, pensionDeductionYear: 0,
      maritalStatus: "TK/0", dependents: 0, monthsInStint: 9,
      priorWithheld: 1_600_000, finalPeriodGross: 10_000_000,
    })
    expect(r).toMatchObject({ annualTax: 2_250_000, pph21: 650_000 })
    expect(r.pph21).not.toBe(computePph21Ter(10_000_000, terA).pph21)
  })
})

describe("T6 lebih potong kembali ke karyawan, bukan slip negatif", () => {
  it("bulan tambahan 55,4jt pada tarif resmi 19%; Des pph21=0 + overWithheld positif", () => {
    const spike = computePph21Ter(55_400_000, terA)
    expect(spike).toMatchObject({ ratePct: 19, pph21: 10_526_000 })
    const r = computePph21FinalPeriod({
      grossYear: 114_800_000, pensionDeductionYear: 0,
      maritalStatus: "TK/0", dependents: 0, monthsInStint: 12,
      priorWithheld: spike.pph21, finalPeriodGross: 5_400_000,
    })
    expect(r.annualTax).toBe(2_753_000)
    expect(r.pph21).toBe(0)
    expect(r.overWithheld).toBe(2_753_000 - 10_526_000 < 0 ? 7_773_000 : 0)
    expect(r.overWithheld).toBe(spike.pph21 - r.annualTax)
  })

  it("kurang potong melebihi bruto slip final menjadi temuan terbuka, bukan negatif", () => {
    const r = computePph21FinalPeriod({
      grossYear: 120_000_000, pensionDeductionYear: 0,
      maritalStatus: "TK/0", dependents: 0, monthsInStint: 12,
      priorWithheld: 0, finalPeriodGross: 1_000_000,
    })
    expect(r.pph21).toBe(1_000_000)
    expect(r.underWithheldExcess).toBe(r.annualTax - 1_000_000)
  })
})

describe("T7 dua slip se-masa: slip kedua memotong selisih gabungan", () => {
  it("THR terpisah = 1.600.000, bukan TER sendiri / bukan dobel", () => {
    const combined = computePph21Ter(20_000_000, terA).pph21
    const already = computePph21Ter(10_000_000, terA).pph21
    expect(combined - already).toBe(1_600_000)
  })
})

describe("klasifikasi masa pajak (vonis §3)", () => {
  it("Desember karyawan penuh vs masuk tengah tahun vs final-resign", () => {
    expect(resolveTerPeriod({ periodYear: 2026, periodMonth: 5, joinDate: new Date("2020-03-01") }))
      .toMatchObject({ kind: "monthly", monthsInStint: 5 }) // bulan berjalan tahun ini
    expect(resolveTerPeriod({ periodYear: 2026, periodMonth: 12, joinDate: new Date("2020-03-01") }))
      .toMatchObject({ kind: "final-december", monthsInStint: 12 })
    expect(resolveTerPeriod({ periodYear: 2026, periodMonth: 12, joinDate: new Date("2026-07-01") }))
      .toMatchObject({ kind: "final-december", monthsInStint: 6 })
    expect(resolveTerPeriod({
      periodYear: 2026, periodMonth: 9, joinDate: new Date("2026-01-01"),
      resignationFinal: true, resignationYearMonth: { year: 2026, month: 9 },
    })).toMatchObject({ kind: "final-resignation", monthsInStint: 9, priorEmployerIncomeIncluded: false })
    // Tanpa penanda eksplisit, September tetap masa biasa (T5 merah tanpanya).
    expect(resolveTerPeriod({ periodYear: 2026, periodMonth: 9, joinDate: new Date("2026-01-01") }).kind).toBe("monthly")
  })
})

describe("penjaga non-angka vonis §6", () => {
  it("tabel kosong/tidak utuh -> null (final ditolak pemanggil)", async () => {
    const empty = { payrollTerBracket: { findMany: vi.fn().mockResolvedValue([]) } }
    expect(await getTerBrackets(empty as never, "A", new Date("2026-01-01"))).toBeNull()
    const partial = {
      payrollTerBracket: {
        findMany: vi.fn().mockResolvedValue([
          { category: "A", lowerBound: 0, upperBound: 5_400_000, rateMilliPercent: 0, effectiveFrom: new Date("2024-01-01"), effectiveTo: null, source: "x" },
        ]),
      },
    }
    expect(await getTerBrackets(partial as never, "A", new Date("2026-01-01"))).toBeNull()
    const down = { payrollTerBracket: { findMany: vi.fn().mockRejectedValue(new Error("db down")) } }
    expect(await getTerBrackets(down as never, "A", new Date("2026-01-01"))).toBeNull()
  })

  it("regresi slip lama: fungsi disetahunkan legacy tidak berubah hasil", () => {
    // Karakterisasi pra-F-026 (payroll-statutory.service.test.ts): kunci beku.
    expect(computePph21Monthly(10_000_000, "TK/0", 400_000)).toBe(230_000)
  })
})

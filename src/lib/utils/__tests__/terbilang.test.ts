import { describe, it, expect } from "vitest"
import { terbilang, terbilangInteger, terbilangLabel } from "../terbilang"

describe("terbilangInteger", () => {
  it("menangani nol dan satuan", () => {
    expect(terbilangInteger(0)).toBe("nol")
    expect(terbilangInteger(7)).toBe("tujuh")
  })

  it("memakai bentuk khusus 11–19", () => {
    expect(terbilangInteger(11)).toBe("sebelas")
    expect(terbilangInteger(12)).toBe("dua belas")
    expect(terbilangInteger(19)).toBe("sembilan belas")
  })

  it("menangani puluhan", () => {
    expect(terbilangInteger(20)).toBe("dua puluh")
    expect(terbilangInteger(21)).toBe("dua puluh satu")
    expect(terbilangInteger(99)).toBe("sembilan puluh sembilan")
  })

  it("memakai 'seratus' untuk 100 dan 'seribu' untuk 1000", () => {
    expect(terbilangInteger(100)).toBe("seratus")
    expect(terbilangInteger(101)).toBe("seratus satu")
    expect(terbilangInteger(200)).toBe("dua ratus")
    expect(terbilangInteger(1000)).toBe("seribu")
    expect(terbilangInteger(1500)).toBe("seribu lima ratus")
    expect(terbilangInteger(2000)).toBe("dua ribu")
  })

  it("menangani juta, miliar, dan triliun", () => {
    expect(terbilangInteger(1_000_000)).toBe("satu juta")
    expect(terbilangInteger(1_500_000)).toBe("satu juta lima ratus ribu")
    expect(terbilangInteger(1_000_000_000)).toBe("satu miliar")
    expect(terbilangInteger(2_500_000_000)).toBe("dua miliar lima ratus juta")
    expect(terbilangInteger(1_000_000_000_000)).toBe("satu triliun")
  })

  it("tidak menulis 'satu ribu' atau 'satu ratus'", () => {
    expect(terbilangInteger(1000)).not.toContain("satu ribu")
    expect(terbilangInteger(100)).not.toContain("satu ratus")
  })

  it("membulatkan pecahan ke bawah untuk bilangan bulat", () => {
    expect(terbilangInteger(1234.9)).toBe("seribu dua ratus tiga puluh empat")
  })
})

describe("terbilang", () => {
  it("menambahkan akhiran rupiah", () => {
    expect(terbilang(34_000_000)).toBe("tiga puluh empat juta rupiah")
  })

  it("menuliskan sen bila ada pecahan", () => {
    expect(terbilang(1250.5)).toBe("seribu dua ratus lima puluh rupiah lima puluh sen")
  })

  it("bisa diminta tanpa sen", () => {
    expect(terbilang(1250.5, { withCents: false })).toBe("seribu dua ratus lima puluh rupiah")
  })

  it("menandai nilai negatif dengan 'minus'", () => {
    expect(terbilang(-1500)).toBe("minus seribu lima ratus rupiah")
  })

  it("nol tetap terbaca 'nol rupiah'", () => {
    expect(terbilang(0)).toBe("nol rupiah")
    expect(terbilang(-0)).toBe("nol rupiah")
  })

  it("bisa tanpa akhiran mata uang", () => {
    expect(terbilang(2000, { suffix: null })).toBe("dua ribu")
  })
})

describe("terbilangLabel", () => {
  it("mengapitalkan huruf pertama", () => {
    expect(terbilangLabel(1000)).toBe("Seribu rupiah")
  })
})

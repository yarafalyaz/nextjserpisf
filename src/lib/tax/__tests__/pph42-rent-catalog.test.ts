import { describe, it, expect } from "vitest"

import {
  PPH42_RENT_OBJECT_CATALOG,
  findPph42RentCatalogEntry,
  parseRentObjectEvidence,
} from "@/lib/tax/pph42-rent-catalog"
import { resolvePph42RentRate, resolvePph42RentRateEntry } from "@/lib/tax/withholding-certificate"

/**
 * F-055-V Tahap A: katalog resmi SATU sumber (nama + tarif + masa efektif)
 * + snapshot objectName + bukti terstruktur (vonis BOT 4 F-2026-10-22-055-V).
 */

const masterUmum = [{ objectCode: "28-403-02", rate: 10, requiresEvidence: false }]
const masterPP = [
  ...masterUmum,
  { objectCode: "28-403-04", rate: 10, requiresEvidence: true },
]
const tanggal = new Date(2026, 0, 10)

describe("F-055-V §2 katalog resmi satu sumber", () => {
  it("2 kode resmi memuat nama DJP persis + tarif 10 + efektif 2025-01-01 terbuka", () => {
    expect(PPH42_RENT_OBJECT_CATALOG).toHaveLength(2)
    const e02 = PPH42_RENT_OBJECT_CATALOG.find((e) => e.objectCode === "28-403-02")
    const e04 = PPH42_RENT_OBJECT_CATALOG.find((e) => e.objectCode === "28-403-04")
    expect(e02?.objectName).toBe("Persewaan Tanah dan/atau Bangunan")
    expect(e04?.objectName).toBe(
      "Persewaan Tanah dan/atau Bangunan sehubungan Pelaksanaan Proyek Pemerintah yang Dibiayai dengan Hibah atau Dana Pinjaman Luar Negeri",
    )
    expect(e02?.rate).toBe(10)
    expect(e04?.rate).toBe(10)
    expect(e02?.requiresEvidence).toBe(false)
    expect(e04?.requiresEvidence).toBe(true)
    expect(e02?.effectiveFrom).toBe("2025-01-01")
    expect(e02?.effectiveTo).toBeNull()
  })

  it("tarif katalog resmi bengkok (tamper 5) = resolver menolak menyimpang", () => {
    // Falsifikasi: goyangkan angka katalog di memori; resolver tetap tolak.
    const entry = PPH42_RENT_OBJECT_CATALOG[0] as { rate: number }
    const asli = entry.rate
    entry.rate = 5
    try {
      expect(() =>
        resolvePph42RentRateEntry("28-403-02", masterUmum, tanggal),
      ).toThrow(/tarif resmi katalog.*menyimpang/)
    } finally {
      entry.rate = asli
    }
  })

  it("lookup tanggal-sadar: sebelum 2025-01-01 tidak ada nama resmi", () => {
    expect(findPph42RentCatalogEntry("28-403-02", new Date(2024, 11, 31))).toBeNull()
    expect(findPph42RentCatalogEntry("28-403-02", new Date(2025, 0, 1))?.objectCode).toBe("28-403-02")
    expect(findPph42RentCatalogEntry("28-403-99", tanggal)).toBeNull()
    expect(findPph42RentCatalogEntry(null, tanggal)).toBeNull()
  })

  it("snapshot objectName beku dari katalog resmi saat terbit", () => {
    const r02 = resolvePph42RentRateEntry("28-403-02", masterUmum, tanggal)
    expect(r02.objectName).toBe("Persewaan Tanah dan/atau Bangunan")
    expect(r02.rate).toBe(10)
    const r04 = resolvePph42RentRateEntry("28-403-04", masterPP, tanggal, {
      evidence: "Kontrak | 12/2026 | 2026-01-05 | Kementerian X | https://contoh/dok",
    })
    expect(r04.objectName).toContain("Proyek Pemerintah")
    expect(r04.evidence?.docNumber).toBe("12/2026")
    expect(r04.evidence?.link).toBe("https://contoh/dok")
  })

  it("kode di master tapi TANPA nama resmi katalog = fail-closed, nama tidak dikarang", () => {
    const masterKarangan = [{ objectCode: "28-403-99", rate: 10, requiresEvidence: false }]
    expect(() => resolvePph42RentRateEntry("28-403-99", masterKarangan, tanggal)).toThrow(
      /nama katalog belum tersedia/,
    )
  })
})

describe("F-055-V §1 bukti terstruktur 28-403-04", () => {
  it("bukti lama teks bebas (Kontrak proyek pemerintah No. 12/2026) kini ditolak", () => {
    expect(() => parseRentObjectEvidence("Kontrak proyek pemerintah No. 12/2026")).toThrow(/wajib format/)
    expect(() =>
      resolvePph42RentRateEntry("28-403-04", masterPP, tanggal, {
        evidence: "Kontrak proyek pemerintah No. 12/2026",
      }),
    ).toThrow(/wajib format/)
  })

  it("nomor/tanggal kosong atau tanggal rusak = bukti tidak sah", () => {
    expect(() => parseRentObjectEvidence("Kontrak |  | 2026-01-05 | Kemen")).toThrow(/wajib format/)
    expect(() => parseRentObjectEvidence("Kontrak | 12/2026 | 05-01-2026 | Kemen")).toThrow(/wajib format/)
    expect(() => parseRentObjectEvidence("Kontrak | 12/2026 | 2026-13-40 | Kemen")).toThrow(/wajib format/)
    expect(() => parseRentObjectEvidence(null)).toThrow(/wajib format/)
    expect(() => parseRentObjectEvidence("   ")).toThrow(/wajib format/)
  })

  it("format sah ter-parse: jenis/nomor/tanggal/penerbit/tautan", () => {
    const p = parseRentObjectEvidence("Kontrak | 12/2026 | 2026-01-05 | Kementerian X")
    expect(p.docType).toBe("Kontrak")
    expect(p.docNumber).toBe("12/2026")
    expect(p.docDate).toBe("2026-01-05")
    expect(p.issuer).toBe("Kementerian X")
    expect(p.link).toBeNull()
  })
})

describe("F-055-V §3 tanggal + kompat shim", () => {
  it("withholdingDate sebelum katalog efektif = fail-closed nama belum tersedia", () => {
    expect(() => resolvePph42RentRateEntry("28-403-02", masterUmum, new Date(2024, 5, 1))).toThrow(
      /nama katalog belum tersedia/,
    )
  })

  it("shim resolvePph42RentRate tetap 10 untuk bukti sah, tolak bukti tak berformat", () => {
    expect(resolvePph42RentRate("28-403-02", masterUmum)).toBe(10)
    expect(() =>
      resolvePph42RentRate("28-403-04", masterPP, { evidence: "Kontrak proyek pemerintah No. 12/2026" }),
    ).toThrow(/wajib format/)
  })
})

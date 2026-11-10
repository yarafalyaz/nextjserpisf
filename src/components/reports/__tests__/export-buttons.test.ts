import { describe, it, expect } from "vitest"

import { buildCsvHeaderLines, buildPdfActionUrl, csvQuote, formatPrintedAtWib } from "../export-buttons"

describe("AC-REP-003 kop ekspor klien", () => {
  it("buildPdfActionUrl menambahkan /unduh/1 pada URL path atau ?unduh=1 pada URL query", () => {
    expect(buildPdfActionUrl("/api/pdf/buku-besar/2026-10", true)).toBe("http://localhost/api/pdf/buku-besar/2026-10/unduh/1")
    expect(buildPdfActionUrl("/api/pdf?laporan=buku-besar&periode=2026-10", true)).toBe("http://localhost/api/pdf?laporan=buku-besar&periode=2026-10&unduh=1")
    expect(buildPdfActionUrl("/api/pdf/buku-besar/2026-10", false)).toBe("http://localhost/api/pdf/buku-besar/2026-10")
  })

  it("waktu cetak selalu Asia/Jakarta berlabel WIB, bukan zona perangkat", () => {
    // 2026-10-28T00:30:00Z = 07:30 WIB hari yang sama.
    expect(formatPrintedAtWib(new Date("2026-10-28T00:30:00.000Z"))).toBe(
      "28 Oktober 2026 07.30 WIB",
    )
    // Batas hari: 2026-10-27T18:00:00Z = 01:00 WIB tanggal 28.
    expect(formatPrintedAtWib(new Date("2026-10-27T18:00:00.000Z"))).toBe(
      "28 Oktober 2026 01.00 WIB",
    )
  })

  it("blok kop CSV: perusahaan, periode bila ada, lalu waktu cetak WIB", () => {
    expect(
      buildCsvHeaderLines({
        companyName: "PT Contoh",
        periodText: "Periode 1 – 31 Oktober 2026",
        printedAt: "28 Oktober 2026 07.30 WIB",
      }),
    ).toEqual([
      '"PT Contoh"',
      '"Periode 1 – 31 Oktober 2026"',
      '"Dicetak: 28 Oktober 2026 07.30 WIB"',
    ])
    expect(
      buildCsvHeaderLines({ companyName: "PT Contoh", printedAt: "28 Oktober 2026 07.30 WIB" }),
    ).toEqual(['"PT Contoh"', '"Dicetak: 28 Oktober 2026 07.30 WIB"'])
  })

  it("putaran 87: kop diawali karakter formula diberi prefix tab (formula injection)", () => {
    expect(
      buildCsvHeaderLines({ companyName: "=SUM(A1:A9)", printedAt: "28 Oktober 2026 07.30 WIB" }),
    ).toEqual(['"\t=SUM(A1:A9)"', '"Dicetak: 28 Oktober 2026 07.30 WIB"'])
    expect(
      buildCsvHeaderLines({ companyName: "@PT Contoh", printedAt: "28 Oktober 2026 07.30 WIB" }),
    ).toEqual(['"\t@PT Contoh"', '"Dicetak: 28 Oktober 2026 07.30 WIB"'])
  })

  it("putaran 93: judul/narasi/section memakai csvQuote yang sama (quote + guard formula)", () => {
    expect(csvQuote('Pusat Laba "=X"')).toBe('"Pusat Laba ""=X"""')
    expect(csvQuote("=SUM(A1:A9)")).toBe('"\t=SUM(A1:A9)"')
    expect(csvQuote("@nama barang")).toBe('"\t@nama barang"')
  })
})

import { describe, it, expect } from "vitest"

import { buildCsvHeaderLines, formatPrintedAtWib } from "../export-buttons"

describe("AC-REP-003 kop ekspor klien", () => {
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
})

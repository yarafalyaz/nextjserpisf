import { describe, it, expect } from "vitest"
import {
  toLocalDateOnly,
  wibDateOnly,
  wibPeriodKey,
  wibYearMonthCompact,
} from "../date-only"
import { wibDateKeyParts } from "@/lib/utils/format"

/**
 * Putaran 102: tanggal dokumen disimpan tengah malam UTC hari kalender WIB
 * (`wibDateToUtcMidnight`). Getter LOKAL proses menggeser tanggal itu ke hari
 * sebelumnya di runtime barat UTC (container/CI tanpa TZ), jadi laporan
 * mencetak 31 Okt untuk dokumen 1 Nov. Helper di sini dipaku ke WIB (UTC+7,
 * tanpa DST) sehingga hasilnya bebas zona proses.
 */

/** Instan yang jam dinding WIB-nya berbeda hari dengan UTC-nya. */
const SPANNING = [
  new Date("2026-10-31T17:00:00Z"), // 1 Nov 2026 00:00 WIB
  new Date("2026-11-01T00:00:00Z"), // 1 Nov 2026 07:00 WIB
  new Date("2026-11-01T20:00:00Z"), // 2 Nov 2026 03:00 WIB
  new Date("2026-01-01T00:00:00Z"), // 1 Jan 2026 07:00 WIB
  new Date("2026-12-31T16:59:59Z"), // 31 Des 2026 23:59:59 WIB
  new Date("2027-01-01T00:00:00Z"), // 1 Jan 2027 07:00 WIB
]

describe("wibDateOnly", () => {
  it("memakai hari kalender WIB untuk nilai tengah malam UTC", () => {
    expect(wibDateOnly(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11-01")
    expect(wibDateOnly(new Date("2026-01-31T00:00:00Z"))).toBe("2026-01-31")
  })

  it("memakai hari kalender WIB untuk instan nyata", () => {
    expect(wibDateOnly(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11-01")
    expect(wibDateOnly(new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-02")
  })

  it("identik dengan wibDateKeyParts (Intl Asia/Jakarta) di seluruh rentang", () => {
    for (const date of SPANNING) {
      const parts = wibDateKeyParts(date)
      expect(wibDateOnly(date)).toBe(`${parts.year}-${parts.month}-${parts.day}`)
    }
  })

  it("BUKAN toLocalDateOnly: hari kalender WIB dan lokal proses berbeda", () => {
    // Bukan asersi atas TZ proses (itu yang membuat tes rapuh); cukup buktikan
    // kedua helper memang dua konsep berbeda dan yang dipakai laporan = WIB.
    const utcMidnight = new Date("2026-11-01T00:00:00Z")
    expect(wibDateOnly(utcMidnight)).toBe("2026-11-01")
    expect(toLocalDateOnly(utcMidnight)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("wibPeriodKey / wibYearMonthCompact", () => {
  it("bucket bulan memakai bulan kalender WIB", () => {
    expect(wibPeriodKey(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11")
    expect(wibPeriodKey(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11")
    expect(wibPeriodKey(new Date("2026-12-31T16:59:59Z"))).toBe("2026-12")
    expect(wibPeriodKey(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01")
  })

  it("prefiks jurnal tanpa pemisah", () => {
    expect(wibYearMonthCompact(new Date("2026-11-01T00:00:00Z"))).toBe("202611")
    expect(wibYearMonthCompact(new Date("2026-01-31T17:00:00Z"))).toBe("202602")
  })

  it("identik dengan wibDateKeyParts untuk tahun-bulan", () => {
    for (const date of SPANNING) {
      const parts = wibDateKeyParts(date)
      expect(wibPeriodKey(date)).toBe(`${parts.year}-${parts.month}`)
      expect(wibYearMonthCompact(date)).toBe(`${parts.year}${parts.month}`)
    }
  })
})

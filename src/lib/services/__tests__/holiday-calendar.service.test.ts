import { describe, expect, it } from "vitest"
import { computeNationalHolidays } from "../holiday-calendar.service"
import { NATIONAL_HOLIDAYS } from "@/lib/setup/national-holidays"

describe("computeNationalHolidays", () => {
  it("reproduces the official SKB 2026 dates except the known Hijri estimate shift", () => {
    const computed = computeNationalHolidays(2026)
    const computedDates = new Set(computed.map((h) => h.date))
    const missing = NATIONAL_HOLIDAYS.filter((h) => !computedDates.has(h.date))
    // Satu-satunya selisih yang diterima: hari kedua Idul Fitri bergeser
    // sehari karena Umm al-Qura vs penetapan SKB (21-22 Mar resmi,
    // generator menghasilkan 20-21 Mar bertanda estimasi).
    expect(missing.map((h) => h.date)).toEqual(["2026-03-22"])
    expect(computed).toHaveLength(NATIONAL_HOLIDAYS.length)
  })

  it("marks Hijri and Nyepi dates as estimates, fixed dates as exact", () => {
    const computed = computeNationalHolidays(2027)
    const byName = (frag: string) => computed.find((h) => h.name.includes(frag))
    expect(byName("Kemerdekaan")?.estimated).toBe(false)
    expect(byName("Idul Fitri")?.estimated).toBe(true)
    expect(byName("Nyepi")?.estimated).toBe(true)
    expect(byName("Imlek")?.estimated).toBe(false)
  })

  it("always yields a full sorted year without duplicates", () => {
    for (const year of [2026, 2027, 2028]) {
      const computed = computeNationalHolidays(year)
      expect(computed.length).toBeGreaterThanOrEqual(16)
      const dates = computed.map((h) => h.date)
      expect([...dates].sort()).toEqual(dates)
      // Tidak boleh ada pasangan (tanggal, nama) ganda. Dua hari raya
      // BERBEDA boleh jatuh di tanggal yang sama (nyata: 2028-05-25
      // Kenaikan Yesus Kristus = Tahun Baru Islam 1450H).
      const pairs = computed.map((h) => `${h.date}|${h.name}`)
      expect(new Set(pairs).size).toBe(pairs.length)
      for (const h of computed) expect(h.date.startsWith(`${year}-`)).toBe(true)
    }
  })
})

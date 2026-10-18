import { describe, expect, it } from "vitest"
import {
  WIB_OFFSET_HOURS,
  computeLateMinutes,
  computeOvertimeMinutes,
  getWibTodayUtcDate,
  wibDateToUtcMidnight,
  wibMinutesOfDay,
  wibTimeToUtcInstant,
} from "../attendance-time"

/**
 * Konvensi waktu absensi punya DUA aturan yang hidup berdampingan, dan
 * mencampurnya menggeser tanggal satu hari:
 *
 * 1. `attendance.date`     = tengah malam UTC untuk hari kalender WIB.
 * 2. `checkIn` / `checkOut` = instan UTC dari jam dinding WIB (08:05 WIB = 01:05Z).
 *
 * Berkas ini tidak memakai jam lokal runner sama sekali: seluruh ekspektasinya
 * ditulis sebagai instan UTC (`toISOString()`), sehingga hasilnya sama di TZ
 * mana pun — termasuk CI yang berjalan di UTC, tempat `toISOString().split("T")[0]`
 * tidak akan pernah menunjukkan cacatnya.
 */

const iso = (value: Date) => value.toISOString()

describe("WIB_OFFSET_HOURS", () => {
  it("bernilai 7 (UTC+7, tanpa DST)", () => {
    expect(WIB_OFFSET_HOURS).toBe(7)
  })
})

describe("getWibTodayUtcDate", () => {
  it("mengembalikan tengah malam UTC untuk hari kalender WIB dari instan yang diberikan", () => {
    // 16:30Z = 23:30 WIB pada hari yang sama.
    expect(iso(getWibTodayUtcDate(new Date("2026-08-17T16:30:00.000Z")))).toBe(
      "2026-08-17T00:00:00.000Z",
    )
  })

  it("memakai hari WIB berikutnya begitu UTC melewati 17:00", () => {
    // 20:00Z = 03:00 WIB keesokan harinya. Turunan naif
    // `toISOString().split("T")[0]` memberi 2026-08-17 — satu hari terlalu awal,
    // dan absensi tercatat pada tanggal yang salah.
    const now = new Date("2026-08-17T20:00:00.000Z")
    expect(iso(getWibTodayUtcDate(now))).toBe("2026-08-18T00:00:00.000Z")
    expect(iso(now).split("T")[0]).toBe("2026-08-17")
  })

  it("berpindah hari tepat pada batas 17:00Z", () => {
    expect(iso(getWibTodayUtcDate(new Date("2026-08-17T16:59:59.999Z")))).toBe(
      "2026-08-17T00:00:00.000Z",
    )
    expect(iso(getWibTodayUtcDate(new Date("2026-08-17T17:00:00.000Z")))).toBe(
      "2026-08-18T00:00:00.000Z",
    )
  })

  it("selalu menghasilkan pukul 00:00:00.000 UTC", () => {
    const result = getWibTodayUtcDate(new Date("2026-12-31T18:45:12.345Z"))
    expect(result.getUTCHours()).toBe(0)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
    expect(result.getUTCMilliseconds()).toBe(0)
    // 2026-12-31T18:45Z = 2027-01-01 01:45 WIB → tahun ikut berganti.
    expect(iso(result)).toBe("2027-01-01T00:00:00.000Z")
  })

  it("tanpa argumen tetap mengembalikan tengah malam UTC", () => {
    const result = getWibTodayUtcDate()
    expect(result.getUTCHours()).toBe(0)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCSeconds()).toBe(0)
    expect(result.getUTCMilliseconds()).toBe(0)
  })
})

describe("wibDateToUtcMidnight", () => {
  it("mengubah YYYY-MM-DD menjadi tengah malam UTC hari itu", () => {
    expect(iso(wibDateToUtcMidnight("2026-08-17"))).toBe("2026-08-17T00:00:00.000Z")
    expect(iso(wibDateToUtcMidnight("2026-01-05"))).toBe("2026-01-05T00:00:00.000Z")
    expect(iso(wibDateToUtcMidnight("2026-12-31"))).toBe("2026-12-31T00:00:00.000Z")
  })

  it("TIDAK menggeser tanggal ke instan WIB", () => {
    // Bila tanggal diturunkan sebagai instan jam dinding WIB, 2026-12-31 WIB
    // berarti 2026-12-30T17:00Z, dan absensi 31 Desember tersimpan pada 30 Desember.
    const stored = wibDateToUtcMidnight("2026-12-31")
    expect(iso(stored)).not.toBe("2026-12-30T17:00:00.000Z")
    expect(iso(stored).slice(0, 10)).toBe("2026-12-31")
  })
})

describe("wibTimeToUtcInstant", () => {
  it("mengubah jam dinding WIB menjadi instan UTC (08:05 WIB = 01:05Z)", () => {
    expect(iso(wibTimeToUtcInstant("2026-08-17", "08:05"))).toBe("2026-08-17T01:05:00.000Z")
  })

  it("cocok dengan nilai seed absensi (check-in 08:05 WIB, check-out 17:10 WIB)", () => {
    // Nilai acuan dari `scripts/seed-hrm-crm-e2e.ts`:
    // checkIn 2026-05-28T01:05:00.000Z, checkOut 2026-05-28T10:10:00.000Z.
    expect(iso(wibTimeToUtcInstant("2026-05-28", "08:05"))).toBe("2026-05-28T01:05:00.000Z")
    expect(iso(wibTimeToUtcInstant("2026-05-28", "17:10"))).toBe("2026-05-28T10:10:00.000Z")
  })

  it("jam di bawah 07:00 WIB jatuh pada hari UTC sebelumnya", () => {
    // 05:00 WIB = 2026-08-16T22:00Z. Absensi tanggal 17 memang menyimpan instan
    // milik hari UTC 16 — itu benar, dan justru alasan `date` disimpan terpisah.
    expect(iso(wibTimeToUtcInstant("2026-08-17", "05:00"))).toBe("2026-08-16T22:00:00.000Z")
    expect(iso(wibTimeToUtcInstant("2026-08-17", "00:00"))).toBe("2026-08-16T17:00:00.000Z")
  })

  it("menjaga jam 23:59 WIB tetap pada hari WIB yang diminta", () => {
    expect(iso(wibTimeToUtcInstant("2026-08-17", "23:59"))).toBe("2026-08-17T16:59:00.000Z")
  })

  it("tetap pada tengah malam UTC tanggal absensi yang sama (koeksistensi dua konvensi)", () => {
    // Satu tanggal absensi: `date` = 2026-08-17T00:00:00Z dan `checkIn` = 01:05Z.
    // Keduanya sah walaupun berbeda 1 jam 5 menit, bukan tengah malam yang sama.
    const date = wibDateToUtcMidnight("2026-08-17")
    const checkIn = wibTimeToUtcInstant("2026-08-17", "08:05")
    expect(checkIn.getTime()).toBeGreaterThan(date.getTime())
    expect(iso(date)).toBe("2026-08-17T00:00:00.000Z")
    expect(iso(checkIn)).toBe("2026-08-17T01:05:00.000Z")
  })
})

describe("wibMinutesOfDay", () => {
  it("membaca jam dinding WIB, bukan jam UTC dari instan tersimpan", () => {
    // 01:05Z adalah 08:05 WIB → 485 menit. Jam UTC-nya sendiri hanya 65 menit.
    expect(wibMinutesOfDay(new Date("2026-08-17T01:05:00.000Z"))).toBe(8 * 60 + 5)
    expect(wibMinutesOfDay(new Date("2026-08-17T01:05:00.000Z"))).not.toBe(65)
  })

  it("menangani tengah malam, batas hari, dan pergantian hari WIB", () => {
    expect(wibMinutesOfDay(new Date("2026-08-16T17:00:00.000Z"))).toBe(0) // 00:00 WIB
    expect(wibMinutesOfDay(new Date("2026-08-17T16:59:00.000Z"))).toBe(23 * 60 + 59) // 23:59 WIB
    expect(wibMinutesOfDay(new Date("2026-08-16T22:00:00.000Z"))).toBe(5 * 60) // 05:00 WIB
  })

  it("bolak-balik konsisten dengan wibTimeToUtcInstant", () => {
    for (const time of ["00:00", "05:30", "08:00", "12:34", "17:10", "23:59"]) {
      const [hours, minutes] = time.split(":").map(Number)
      expect(wibMinutesOfDay(wibTimeToUtcInstant("2026-08-17", time))).toBe(hours * 60 + minutes)
    }
  })
})

describe("computeLateMinutes", () => {
  it("menghitung menit setelah jam mulai jadwal", () => {
    expect(computeLateMinutes("08:00", wibTimeToUtcInstant("2026-08-17", "08:05"))).toBe(5)
    expect(computeLateMinutes("08:00", wibTimeToUtcInstant("2026-08-17", "08:45"))).toBe(45)
    expect(computeLateMinutes("05:00", wibTimeToUtcInstant("2026-08-17", "06:00"))).toBe(60)
  })

  it("tepat waktu dan datang lebih awal tidak pernah negatif", () => {
    expect(computeLateMinutes("08:00", wibTimeToUtcInstant("2026-08-17", "08:00"))).toBe(0)
    expect(computeLateMinutes("08:00", wibTimeToUtcInstant("2026-08-17", "07:50"))).toBe(0)
    expect(computeLateMinutes("08:00", wibTimeToUtcInstant("2026-08-17", "00:30"))).toBe(0)
  })

  it("tanpa jam masuk menghasilkan 0 (tidak ada keterlambatan yang bisa dihitung)", () => {
    expect(computeLateMinutes("08:00", null)).toBe(0)
  })

  it("tidak terpengaruh pergeseran hari UTC pada check-in subuh", () => {
    // 05:30 WIB tersimpan sebagai 2026-08-16T22:30Z; jam dinding WIB-nya tetap 330,
    // sehingga keterlambatan terhadap jadwal 05:00 WIB = 30 menit.
    const checkIn = wibTimeToUtcInstant("2026-08-17", "05:30")
    expect(iso(checkIn)).toBe("2026-08-16T22:30:00.000Z")
    expect(computeLateMinutes("05:00", checkIn)).toBe(30)
  })
})

describe("computeOvertimeMinutes", () => {
  it("menghitung menit setelah jam selesai jadwal", () => {
    expect(computeOvertimeMinutes("17:00", wibTimeToUtcInstant("2026-08-17", "18:10"))).toBe(70)
    expect(computeOvertimeMinutes("16:00", wibTimeToUtcInstant("2026-05-28", "17:10"))).toBe(70)
  })

  it("pulang tepat waktu atau lebih awal tidak pernah negatif", () => {
    expect(computeOvertimeMinutes("17:00", wibTimeToUtcInstant("2026-08-17", "17:00"))).toBe(0)
    expect(computeOvertimeMinutes("17:00", wibTimeToUtcInstant("2026-08-17", "16:30"))).toBe(0)
  })

  it("tanpa jam keluar menghasilkan 0", () => {
    expect(computeOvertimeMinutes("17:00", null)).toBe(0)
  })

  it("menghitung sampai batas akhir hari WIB", () => {
    expect(computeOvertimeMinutes("17:00", wibTimeToUtcInstant("2026-08-17", "23:59"))).toBe(
      23 * 60 + 59 - 17 * 60,
    )
  })
})

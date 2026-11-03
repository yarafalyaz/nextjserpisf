import { describe, expect, it } from "vitest"

import { parseWorkDays, parseWorkDaysWithFallback } from "../work-days"

/**
 * Satu-satunya pengurai `workDays` (CSV angka hari 0–6, 0 = Minggu).
 *
 * Cacat yang dijaga: `Number("")` bernilai 0, dan 0 adalah hari Minggu yang
 * SAH — sehingga teks kosong ("", "1,2,3,") dulu menghasilkan himpunan
 * {Minggu}, dan fallback Senin–Jumat tidak pernah hidup. Akibatnya slip gaji
 * massal hanya menghitung hari Minggu sebagai hari kerja: hari biasa tidak
 * pernah "absent" (potongan absen hilang) dan hari Minggu selalu "absent".
 */
describe("parseWorkDays", () => {
  it("CSV normal", () => {
    expect(parseWorkDays("1,2,3,4,5")).toEqual([1, 2, 3, 4, 5])
  })

  it("spasi di sekitar token diabaikan", () => {
    expect(parseWorkDays(" 1 , 2 ")).toEqual([1, 2])
  })

  it("token kosong tidak boleh menjadi hari Minggu", () => {
    expect(parseWorkDays("1,2,3,")).toEqual([1, 2, 3])
    expect(parseWorkDays(",1")).toEqual([1])
    expect(parseWorkDays("1,,2")).toEqual([1, 2])
  })

  it("Minggu (0) yang ditulis eksplisit tetap sah", () => {
    expect(parseWorkDays("0,6")).toEqual([0, 6])
  })

  it("teks kosong / tidak valid jatuh ke fallback Senin–Jumat", () => {
    expect(parseWorkDays("")).toEqual([1, 2, 3, 4, 5])
    expect(parseWorkDays(null)).toEqual([1, 2, 3, 4, 5])
    expect(parseWorkDays(undefined)).toEqual([1, 2, 3, 4, 5])
    expect(parseWorkDays("7,9,-1,abc")).toEqual([1, 2, 3, 4, 5])
  })

  it("duplikat dibuang, urutan naik", () => {
    expect(parseWorkDays("5,1,1,3")).toEqual([1, 3, 5])
  })
})

describe("parseWorkDaysWithFallback", () => {
  it("menandai kapan fallback dipakai", () => {
    expect(parseWorkDaysWithFallback("")).toEqual({ days: [1, 2, 3, 4, 5], usedFallback: true })
    expect(parseWorkDaysWithFallback("0")).toEqual({ days: [0], usedFallback: false })
    // Token kosong saja juga bukan jadwal sah — jangan jadi Minggu.
    expect(parseWorkDaysWithFallback(",")).toEqual({ days: [1, 2, 3, 4, 5], usedFallback: true })
  })
})

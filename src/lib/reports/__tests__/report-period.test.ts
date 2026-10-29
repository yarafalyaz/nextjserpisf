import { describe, it, expect } from "vitest"
import {
  buildReportPeriodSlug,
  formatPeriodLabel,
  looksLikePeriodSlug,
  parseReportPeriod,
  reportPeriodFromRoute,
  splitReportSegments,
} from "../report-period"

const fallback = { start: new Date(2026, 9, 12), end: new Date(2026, 9, 12) }

describe("reportPeriodFromRoute", () => {
  const fallbackOf = (now: Date) => ({ start: new Date(now.getFullYear(), 0, 1), end: now })

  it("reads the period from the first path segment", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: ["2026-10"] }),
      Promise.resolve({}),
      fallbackOf,
    )
    expect(period.slug).toBe("2026-10")
    expect(period.start).toEqual(new Date(2026, 9, 1))
    expect(period.end.getDate()).toBe(31)
  })

  // Regresi: sebelum URL pindah ke path, periode ada di query string. Tautan
  // lama harus tetap membuka periode yang sama, bukan periode bawaan — kalau
  // tidak, laporan menampilkan angka berbeda tanpa satu pun pesan error.
  it("masih menghormati ?tanggalMulai/?tanggalSelesai dari tautan lama", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({ tanggalMulai: "2026-01-01", tanggalSelesai: "2026-10-13" }),
      fallbackOf,
    )
    expect(period.slug).toBe("2026-01-01_2026-10-13")
    expect(period.start).toEqual(new Date(2026, 0, 1))
  })

  it("path menang atas query bila keduanya ada", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: ["2026-10"] }),
      Promise.resolve({ tanggalMulai: "2026-01-01" }),
      fallbackOf,
    )
    expect(period.slug).toBe("2026-10")
  })

  it("pakai periode bawaan bila tidak ada keduanya", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({}),
      fallbackOf,
    )
    const now = new Date()
    expect(period.start).toEqual(new Date(now.getFullYear(), 0, 1))
    expect(period.end.getDate()).toBe(now.getDate())
  })

  // Regresi: sebelum URL pindah ke path, `?tanggalMulai` TANPA tanggalSelesai
  // berarti "dari tanggal itu sampai hari ini" (end = now). Versi pertama
  // helper ini menyusutkannya menjadi satu hari, mempersempit bookmark lama.
  it("tautan lama dengan hanya tanggalMulai berarti sampai hari ini", async () => {
    const today = new Date()
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({ tanggalMulai: "2026-01-01" }),
      fallbackOf,
    )
    expect(period.start).toEqual(new Date(2026, 0, 1))
    expect(period.end.getDate()).toBe(today.getDate())
    expect(period.end.getMonth()).toBe(today.getMonth())
  })

  // Param tunggal (opname `date`) tetap satu hari — tidak diperluas ke hari ini.
  it("param legacy tunggal tidak diperluas sampai hari ini", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({ date: "2026-03-05" }),
      fallbackOf,
      { legacyParam: "date" },
    )
    expect(period.slug).toBe("2026-03-05")
    expect(period.start.getTime()).toBe(period.end.getTime() - 86_399_999)
  })

  // Stok opname memakai `?date=` (bukan tanggalMulai/tanggalSelesai).
  it("menerima nama param legacy yang berbeda", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({ date: "2026-10-13" }),
      fallbackOf,
      { legacyParam: "date" },
    )
    expect(period.slug).toBe("2026-10-13")
  })

  it("tidak membaca tanggalMulai saat param legacy diarahkan ke nama lain", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({ tanggalMulai: "2026-01-01", date: "2026-10-13" }),
      fallbackOf,
      { legacyParam: "date" },
    )
    expect(period.slug).toBe("2026-10-13")
  })

  // B1 pola posisi (neraca/aset-tetap): yang dipakai adalah AKHIR periode,
  // jadi tautan lama harus berakhir 23:59:59.999 pada tanggalSelesai.
  it("pola posisi: tautan lama berakhir pada akhir tanggalSelesai (.999)", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({ tanggalMulai: "2026-01-01", tanggalSelesai: "2026-10-13" }),
      (now) => ({ start: now, end: now }),
    )
    expect(period.end).toEqual(new Date(2026, 9, 13, 23, 59, 59, 999))
  })

  // B1 pola rentang (mutasi-aset/biaya-pekerjaan): kedua ujung dari tautan
  // lama, bukan periode bawaan awal-tahun.
  it("pola rentang: tautan lama memberi kedua ujung periode", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({ tanggalMulai: "2026-03-01", tanggalSelesai: "2026-03-31" }),
      fallbackOf,
    )
    expect(period.start).toEqual(new Date(2026, 2, 1))
    expect(period.end).toEqual(new Date(2026, 2, 31, 23, 59, 59, 999))
  })
})

describe("looksLikePeriodSlug", () => {
  it("mengenali keempat bentuk slug periode", () => {
    expect(looksLikePeriodSlug("2026-10-13")).toBe(true)
    expect(looksLikePeriodSlug("2026-10")).toBe(true)
    expect(looksLikePeriodSlug("2026")).toBe(true)
    expect(looksLikePeriodSlug("2026-01-01_2026-10-13")).toBe(true)
  })

  it("menolak kunci filter dan segmen kosong", () => {
    expect(looksLikePeriodSlug("gudang")).toBe(false)
    expect(looksLikePeriodSlug("gudang-utama")).toBe(false)
    expect(looksLikePeriodSlug(undefined)).toBe(false)
    expect(looksLikePeriodSlug("")).toBe(false)
  })
})

describe("splitReportSegments", () => {
  it("memisahkan periode dari filter saat periode ada", () => {
    expect(splitReportSegments(["2026-10", "barang", "busi-iridium"])).toEqual({
      periodSlug: "2026-10",
      filters: { barang: "busi-iridium" },
    })
  })

  it("memperlakukan semua segmen sebagai filter bila tanpa periode", () => {
    expect(splitReportSegments(["gudang", "gudang-utama"])).toEqual({
      filters: { gudang: "gudang-utama" },
    })
  })

  it("membaca jendela antrean dari pasangan path tanpa periode", () => {
    expect(splitReportSegments(["jendelaDepan", "30"])).toEqual({
      filters: { jendelaDepan: "30" },
    })
    expect(splitReportSegments(["jendelaDepan", "30", "jendelaLampau", "90"])).toEqual({
      filters: { jendelaDepan: "30", jendelaLampau: "90" },
    })
  })

  it("aman untuk rute kosong", () => {
    expect(splitReportSegments([])).toEqual({ filters: {} })
  })
})

describe("buildReportPeriodSlug", () => {
  it("uses YYYY-MM-DD for a single day", () => {
    expect(buildReportPeriodSlug(new Date(2026, 9, 12), new Date(2026, 9, 12))).toBe("2026-10-12")
  })

  it("uses YYYY-MM for a whole month", () => {
    expect(buildReportPeriodSlug(new Date(2026, 9, 1), new Date(2026, 9, 31))).toBe("2026-10")
    expect(buildReportPeriodSlug(new Date(2026, 1, 1), new Date(2026, 1, 28))).toBe("2026-02")
  })

  it("uses YYYY for a whole year", () => {
    expect(buildReportPeriodSlug(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe("2026")
  })

  it("falls back to an explicit range for anything else", () => {
    expect(buildReportPeriodSlug(new Date(2026, 0, 1), new Date(2026, 9, 12))).toBe("2026-01-01_2026-10-12")
  })

  it("does not treat a partial month as a whole month", () => {
    expect(buildReportPeriodSlug(new Date(2026, 9, 1), new Date(2026, 9, 30))).toBe("2026-10-01_2026-10-30")
  })
})

describe("parseReportPeriod", () => {
  it("parses a day slug into that whole day", () => {
    const period = parseReportPeriod("2026-10-12", fallback)
    expect(period.start.getHours()).toBe(0)
    expect(period.end.getHours()).toBe(23)
    expect(period.end.getDate()).toBe(12)
  })

  it("parses a month slug into the whole month", () => {
    const period = parseReportPeriod("2026-10", fallback)
    expect(period.start.getDate()).toBe(1)
    expect(period.end.getDate()).toBe(31)
    expect(period.slug).toBe("2026-10")
  })

  it("clamps February correctly, including a leap year", () => {
    expect(parseReportPeriod("2026-02", fallback).end.getDate()).toBe(28)
    expect(parseReportPeriod("2028-02", fallback).end.getDate()).toBe(29)
  })

  it("parses a year slug", () => {
    const period = parseReportPeriod("2025", fallback)
    expect(period.start.getMonth()).toBe(0)
    expect(period.end.getMonth()).toBe(11)
    expect(period.end.getDate()).toBe(31)
    expect(period.slug).toBe("2025")
  })

  it("parses an explicit range", () => {
    const period = parseReportPeriod("2026-01-05_2026-03-20", fallback)
    expect(period.start.getMonth()).toBe(0)
    expect(period.start.getDate()).toBe(5)
    expect(period.end.getMonth()).toBe(2)
    expect(period.end.getDate()).toBe(20)
  })

  it("round-trips every generated form", () => {
    const samples = [
      { start: new Date(2026, 9, 12), end: new Date(2026, 9, 12) },
      { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
      { start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) },
      { start: new Date(2026, 0, 1), end: new Date(2026, 9, 12) },
    ]
    for (const sample of samples) {
      const parsed = parseReportPeriod(buildReportPeriodSlug(sample.start, sample.end), fallback)
      expect(parsed.slug).toBe(buildReportPeriodSlug(sample.start, sample.end))
    }
  })

  it("falls back for junk, reversed ranges and impossible dates", () => {
    expect(parseReportPeriod("ngawur", fallback).slug).toBe("2026-10-12")
    expect(parseReportPeriod("2026-03-20_2026-01-05", fallback).slug).toBe("2026-10-12")
    expect(parseReportPeriod("2026-13", fallback).slug).toBe("2026-10-12")
    expect(parseReportPeriod(undefined, fallback).slug).toBe("2026-10-12")
  })

  // B6: konstruktor Date menggeser 2026-02-31 menjadi 3 Mar 2026. Hari
  // mustahil wajib ditolak ke fallback seperti bulan 13 — bukan bergeser.
  it("menolak hari mustahil alih-alih menggesernya ke bulan berikutnya", () => {
    expect(parseReportPeriod("2026-02-31", fallback).slug).toBe("2026-10-12")
    expect(parseReportPeriod("2026-02-29", fallback).slug).toBe("2026-10-12")
    expect(parseReportPeriod("2026-04-31", fallback).slug).toBe("2026-10-12")
    expect(parseReportPeriod("2026-13-01", fallback).slug).toBe("2026-10-12")
    expect(parseReportPeriod("2026-01-00", fallback).slug).toBe("2026-10-12")
  })

  it("menerima 29 Februari pada tahun kabisat", () => {
    const period = parseReportPeriod("2028-02-29", fallback)
    expect(period.slug).toBe("2028-02-29")
    expect(period.start).toEqual(new Date(2028, 1, 29))
  })

  it("menolak rentang yang salah satu ujungnya mustahil", () => {
    expect(parseReportPeriod("2026-01-01_2026-02-31", fallback).slug).toBe("2026-10-12")
    expect(parseReportPeriod("2026-02-31_2026-03-01", fallback).slug).toBe("2026-10-12")
  })

  it("tautan lama dengan tanggal mustahil gugur ke fallback, bukan bergeser", async () => {
    const period = await reportPeriodFromRoute(
      Promise.resolve({ segments: [] }),
      Promise.resolve({ tanggalMulai: "2026-01-01", tanggalSelesai: "2026-02-31" }),
      (now) => ({ start: new Date(now.getFullYear(), 0, 1), end: now }),
    )
    const now = new Date()
    expect(period.start).toEqual(new Date(now.getFullYear(), 0, 1))
  })
})

describe("formatPeriodLabel", () => {
  it("uses 'Per' for a single day and 'Periode' for a range", () => {
    expect(formatPeriodLabel({ start: new Date(2026, 9, 12), end: new Date(2026, 9, 12) })).toContain("Per 12")
    expect(formatPeriodLabel({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) })).toContain("Periode")
  })
})

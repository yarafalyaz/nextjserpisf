import { describe, it, expect } from "vitest"

/**
 * F-2026-10-24-132-V E132-1..2 (vonis BOT 4): rumus per segmen, masa pecahan
 * 4-desimal, <1 bulan ditolak di service (diuji di service test), rencana
 * akrual menutup ke nominal peristiwa persis.
 */
import {
  computeServiceMonths,
  computeCompensationAmount,
  planSegmentAccruals,
  buildPkwtCompensationReport,
} from "../pkwt-compensation"

const d = (s: string) => new Date(`${s}T00:00:00+07:00`)

describe("E132-1 masa kerja pecahan + nominal per segmen", () => {
  it("contoh beku vonis: 1 Jan–30 Jun = 6,0000; 1 Jan–15 Jun = 5,5000", () => {
    expect(computeServiceMonths(d("2026-01-01"), d("2026-06-30"))).toBe(6)
    expect(computeServiceMonths(d("2026-01-01"), d("2026-06-15"))).toBe(5.5)
  })

  it("nominal = masa/12 × basis (pokok + tunjangan tetap)", () => {
    expect(computeCompensationAmount(12, 5_000_000)).toBe(5_000_000)
    expect(computeCompensationAmount(6, 5_000_000)).toBe(2_500_000)
    expect(computeCompensationAmount(5.5, 5_000_000)).toBe(2_291_666.67)
  })

  it("perpanjangan = segmen baru berdiri sendiri (bukan kumulatif)", () => {
    const seg1 = computeCompensationAmount(computeServiceMonths(d("2026-01-01"), d("2026-12-31")), 4_000_000)
    const seg2 = computeCompensationAmount(computeServiceMonths(d("2027-01-01"), d("2027-06-30")), 4_000_000)
    expect(seg1).toBe(4_000_000)
    expect(seg2).toBe(2_000_000)
  })

  it("pengakhiran dini berhenti tanggal aktual", () => {
    expect(computeServiceMonths(d("2026-01-01"), d("2026-03-31"))).toBe(3)
  })

  it("jangkar mundur: sisa hari / panjang periode bulanan jangkar, jangkar tak overflow", () => {
    // Tepat satu periode bulanan terlayani = 1,0000 persis: pembagi adalah
    // panjang periode 15 Jan→15 Feb (31 hari), BUKAN hari bulan Feb (28) —
    // pembagi kalender apa pun mematahkan kasus ini (31/28 = 1,1071).
    expect(computeServiceMonths(d("2026-01-15"), d("2026-02-14"))).toBe(1)
    // Periode ter-clamp 31 Jan→28 Feb panjangnya 28 hari: terlayani penuh
    // pada 27 Feb inklusif (28/28), hari berikutnya masuk periode baru.
    expect(computeServiceMonths(d("2026-01-31"), d("2026-02-27"))).toBe(1)
    expect(computeServiceMonths(d("2026-01-31"), d("2026-02-28"))).toBe(1.0323)
    expect(computeServiceMonths(d("2026-01-30"), d("2026-02-28"))).toBe(1.0333)
    // 31 Jan→1 Mar: 1 bulan penuh (ke 28 Feb, clamp) + sisa 2 hari / periode
    // berjalan 28 Feb→31 Mar = 31 hari.
    expect(computeServiceMonths(d("2026-01-31"), d("2026-03-01"))).toBe(1.0645)
  })

  it("jangkar ter-clamp dari bulan pendek: 31 Agu→Feb tetap konsisten", () => {
    // 31 Agu + 6 bulan ter-clamp 28 Feb: 28 Feb = hari pertama periode ke-7.
    expect(computeServiceMonths(d("2025-08-31"), d("2026-02-28"))).toBe(6.0323)
    expect(computeServiceMonths(d("2025-08-31"), d("2026-03-01"))).toBe(6.0645)
  })

  it("monoton: tambah satu hari tak pernah menurunkan masa kerja", () => {
    const feb28 = computeServiceMonths(d("2026-01-31"), d("2026-02-28"))
    const mar1 = computeServiceMonths(d("2026-01-31"), d("2026-03-01"))
    const mar2 = computeServiceMonths(d("2026-01-31"), d("2026-03-02"))
    expect(feb28).toBeLessThan(mar1)
    expect(mar1).toBeLessThan(mar2)
  })
})

describe("E132-2 rencana akrual menutup ke nominal peristiwa", () => {
  it("Σ rencana = nominal peristiwa persis (selisih sen bulan terakhir)", () => {
    const plans = planSegmentAccruals({
      segmentStart: d("2026-01-01"),
      segmentEnd: d("2026-06-15"),
      basisMonthly: 5_000_000,
      eventAmount: 2_291_666.67,
    })
    const total = plans.reduce((s, p) => Math.round((s + p.amount) * 100) / 100, 0)
    expect(total).toBe(2_291_666.67)
    expect(plans[plans.length - 1].isClosingMonth).toBe(true)
    expect(plans.length).toBe(6)
  })

  it("segmen 12 bulan penuh: 12 baris, total = basis", () => {
    const plans = planSegmentAccruals({
      segmentStart: d("2026-01-01"),
      segmentEnd: d("2026-12-31"),
      basisMonthly: 6_000_000,
      eventAmount: 6_000_000,
    })
    expect(plans.length).toBe(12)
    expect(plans.reduce((s, p) => s + p.amount, 0)).toBe(6_000_000)
  })
})

describe("E132-5 rekonsiliasi 3 arah + daftar belum dibayar", () => {
  it("selisih GL tampil sebagai temuan; belum dibayar = terbekukan − terbayar", () => {
    const report = buildPkwtCompensationReport({
      glPayableBalance: 1_000_000,
      mappingMissing: false,
      events: [
        {
          eventId: 1, employeeId: 1, employeeName: "Budi",
          segmentStart: d("2026-01-01"), segmentEnd: d("2026-06-30"),
          serviceMonths: 6, amount: 2_500_000, status: "approved",
          isLegacy: false, accruedToDate: 2_000_000, paidAmount: 0,
        },
        {
          eventId: 2, employeeId: 2, employeeName: "Ani",
          segmentStart: d("2026-01-01"), segmentEnd: d("2026-12-31"),
          serviceMonths: 12, amount: 5_000_000, status: "paid",
          isLegacy: false, accruedToDate: 5_000_000, paidAmount: 5_000_000,
        },
      ],
    })
    expect(report.expectedPayableTotal).toBe(2_500_000)
    expect(report.unpaidList).toHaveLength(1)
    expect(report.unpaidList[0].label).toBe("Kompensasi PKWT belum dibayar")
    expect(report.anomalies.some((a) => a.code === "GL_VS_EVENT_DIFF")).toBe(true)
  })
})

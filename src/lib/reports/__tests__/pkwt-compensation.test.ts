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

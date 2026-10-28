import { describe, it, expect } from "vitest"
import {
  assertPayrollPeriodMatchesEndDate,
  classifyPayrollRunPopulation,
  countPayrollRunSkips,
  findPayrollRangeConflict,
  isPayrollFrequency,
  PAYROLL_RUN_SKIP_LABELS,
  type PayrollRangeSlip,
} from "../payroll-frequency"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const slip = (start: string, end: string, documentNo: string, status = "draft"): PayrollRangeSlip => ({
  startDate: d(start),
  endDate: d(end),
  status,
  documentNo,
})

describe("F-076-S builder payroll-frequency", () => {
  it("kosakata frekuensi tertutup MONTHLY/WEEKLY", () => {
    expect(isPayrollFrequency("MONTHLY")).toBe(true)
    expect(isPayrollFrequency("WEEKLY")).toBe(true)
    expect(isPayrollFrequency("weekly")).toBe(false)
    expect(isPayrollFrequency("DAILY")).toBe(false)
    expect(isPayrollFrequency(undefined)).toBe(false)
  })

  it("AC-PF-1: run MONTHLY hanya populasi MONTHLY; WEEKLY terlewati terhitung", () => {
    const { targetIds, skips } = classifyPayrollRunPopulation(
      [
        { id: 1, paymentFrequency: "MONTHLY", hasActiveLoanWithoutWeeklyInstallment: false },
        { id: 2, paymentFrequency: "WEEKLY", hasActiveLoanWithoutWeeklyInstallment: false },
      ],
      "MONTHLY",
    )
    expect(targetIds).toEqual([1])
    expect(skips).toEqual([{ employeeId: 2, reason: "frekuensiLain", conflictDocumentNo: null }])
  })

  it("AC-PF-1 sebaliknya: run WEEKLY tidak menarik MONTHLY", () => {
    const { targetIds, skips } = classifyPayrollRunPopulation(
      [
        { id: 1, paymentFrequency: "MONTHLY", hasActiveLoanWithoutWeeklyInstallment: false },
        { id: 2, paymentFrequency: "WEEKLY", hasActiveLoanWithoutWeeklyInstallment: false },
      ],
      "WEEKLY",
    )
    expect(targetIds).toEqual([2])
    expect(skips.map((s) => s.reason)).toEqual(["frekuensiLain"])
  })

  it("AC-PF-4 + F-105-V: WEEKLY berpinjaman tanpa nominal mingguan terlewati alasan pinjaman", () => {
    const { targetIds, skips } = classifyPayrollRunPopulation(
      [{ id: 2, paymentFrequency: "WEEKLY", hasActiveLoanWithoutWeeklyInstallment: true }],
      "WEEKLY",
    )
    expect(targetIds).toEqual([])
    expect(skips).toEqual([{ employeeId: 2, reason: "pinjaman", conflictDocumentNo: null }])
  })

  it("turunan F-076-S: WEEKLY tanpa pinjaman tanpa nominal LOLOS (agregator BPJS se-masa F-103-V)", () => {
    const { targetIds, skips } = classifyPayrollRunPopulation(
      [{ id: 2, paymentFrequency: "WEEKLY", hasActiveLoanWithoutWeeklyInstallment: false }],
      "WEEKLY",
    )
    expect(targetIds).toEqual([2])
    expect(skips).toEqual([])
  })

  it("MONTHLY berpinjaman tetap lolos (perilaku existing tidak berubah)", () => {
    const { targetIds, skips } = classifyPayrollRunPopulation(
      [{ id: 1, paymentFrequency: "MONTHLY", hasActiveLoanWithoutWeeklyInstallment: true }],
      "MONTHLY",
    )
    expect(targetIds).toEqual([1])
    expect(skips).toEqual([])
  })

  it("AC-PF-5: hitung terlewati per alasan lengkap tanpa nominal", () => {
    const counts = countPayrollRunSkips([
      { employeeId: 1, reason: "frekuensiLain", conflictDocumentNo: null },
      { employeeId: 2, reason: "pinjaman", conflictDocumentNo: null },
      { employeeId: 3, reason: "bpjsBelumDidukung", conflictDocumentNo: null },
      { employeeId: 4, reason: "irisan", conflictDocumentNo: "PAY-1" },
      { employeeId: 5, reason: "berhenti", conflictDocumentNo: null },
      { employeeId: 6, reason: "frekuensiLain", conflictDocumentNo: null },
      { employeeId: 7, reason: "cakupan", conflictDocumentNo: null },
    ])
    expect(counts).toEqual({ frekuensiLain: 2, pinjaman: 1, bpjsBelumDidukung: 1, plafonPotongan: 0, irisan: 1, berhenti: 1, cakupan: 1 })
    for (const reason of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(PAYROLL_RUN_SKIP_LABELS[reason].length).toBeGreaterThan(0)
    }
  })

  it("BR-HRS-04: label + urutan tampil alasan cakupan di ujung (tanpa nominal)", () => {
    expect(PAYROLL_RUN_SKIP_LABELS.cakupan).toBe("Di luar cakupan akses HR — tidak dibuatkan slip")
    expect(countPayrollRunSkips([])).toEqual({ frekuensiLain: 0, pinjaman: 0, bpjsBelumDidukung: 0, plafonPotongan: 0, irisan: 0, berhenti: 0, cakupan: 0 })
  })

  it("AC-PF-2: slip minggu ke-2 bulan sama (rentang beda) TIDAK konflik — kunci period lama akan menolak", () => {
    const existing = [slip("2026-10-05", "2026-10-11", "PAY-202610-0001")]
    expect(findPayrollRangeConflict(existing, d("2026-10-12"), d("2026-10-18"))).toBeNull()
  })

  it("AC-PF-3: rentang beririsan ditolak menyebut documentNo penabrak", () => {
    const existing = [slip("2026-10-05", "2026-10-11", "PAY-202610-0001", "approved")]
    const conflict = findPayrollRangeConflict(existing, d("2026-10-10"), d("2026-10-16"))
    expect(conflict?.documentNo).toBe("PAY-202610-0001")
  })

  it("AC-PF-3: rentang bersebelahan persis (mulai = tanggal selesai slip lain + pola minggu berikut) lolos", () => {
    // Slip tersimpan Mon 5 - Sun 11 (endDate awal hari 11). Minggu berikut
    // mulai Mon 12: tidak beririsan. Mulai tepat pada tanggal selesai (11)
    // juga lolos karena endDate tersimpan = awal hari selesai
    // (setengah-terbuka [start, end+1hari)).
    const existing = [slip("2026-10-05", "2026-10-11", "PAY-202610-0001")]
    expect(findPayrollRangeConflict(existing, d("2026-10-11"), d("2026-10-17"))).toBeNull()
    expect(findPayrollRangeConflict(existing, d("2026-10-12"), d("2026-10-18"))).toBeNull()
  })

  it("AC-PF-3: slip cancelled tidak memblokir rentang yang sama", () => {
    const existing = [slip("2026-10-05", "2026-10-11", "PAY-202610-0001", "cancelled")]
    expect(findPayrollRangeConflict(existing, d("2026-10-05"), d("2026-10-11"))).toBeNull()
  })

  it("rentang identik persis = konflik (dobel rentang sama ditolak)", () => {
    const existing = [slip("2026-10-05", "2026-10-11", "PAY-202610-0001", "paid")]
    expect(findPayrollRangeConflict(existing, d("2026-10-05"), d("2026-10-11"))?.documentNo).toBe("PAY-202610-0001")
  })

  it("AC-PF2-5: period karangan YYYY-MM-Wn ditolak; period != bulan endDate ditolak", () => {
    expect(() => assertPayrollPeriodMatchesEndDate("2026-10-W2", d("2026-10-11"))).toThrow(/YYYY-MM/)
    expect(() => assertPayrollPeriodMatchesEndDate("2026-09", d("2026-10-11"))).toThrow(/tanggal selesai/)
    expect(() => assertPayrollPeriodMatchesEndDate("2026-10", d("2026-10-11"))).not.toThrow()
    // Slip melintasi dua bulan: masa = bulan endDate (V-PF2-1).
    expect(() => assertPayrollPeriodMatchesEndDate("2026-11", d("2026-11-01"))).not.toThrow()
  })
})

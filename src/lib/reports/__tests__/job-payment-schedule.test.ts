import { describe, it, expect } from "vitest"
import {
  buildJobPaymentScheduleView,
  validateJobPaymentTerms,
  JOB_PAYMENT_TERM_STATUS_LABELS,
  type JobPaymentTermInput,
} from "../job-payment-schedule"

/**
 * F-2026-10-22-067-S + vonis F-2026-10-22-072-V (BOT 4) + putusan
 * BOT 1 Q-TM67-1/3/5. Terpenuhi diukur dari tertagih
 * (billedAmountExcludingCancelled), BUKAN DP; builder tidak menerima
 * DP sama sekali — fixture DP-melebihi-termin diuji di level loader/
 * aksi (DP tidak pernah diteruskan ke builder).
 */

const NOW = new Date(Date.UTC(2026, 9, 22, 3, 0, 0)) // 10:00 WIB, 22 Okt 2026

function term(over: Partial<JobPaymentTermInput> = {}): JobPaymentTermInput {
  return {
    id: 1,
    name: "Termin 1",
    cumulativePercent: 50,
    dueDate: new Date(Date.UTC(2026, 10, 1)),
    milestoneLabel: null,
    sortOrder: 0,
    ...over,
  }
}

function threeTerms(): JobPaymentTermInput[] {
  return [
    term({ id: 1, name: "DP", cumulativePercent: 30, dueDate: new Date(Date.UTC(2026, 9, 1)), sortOrder: 0 }),
    term({ id: 2, name: "Rangka", cumulativePercent: 70, dueDate: new Date(Date.UTC(2026, 10, 15)), sortOrder: 1 }),
    term({ id: 3, name: "Pelunasan", cumulativePercent: 100, dueDate: new Date(Date.UTC(2026, 11, 1)), sortOrder: 2 }),
  ]
}

describe("buildJobPaymentScheduleView (F-067 inti)", () => {
  it("basis persen = grandTotal termasuk PPN (falsifikasi BOT 6 butir 2)", () => {
    const view = buildJobPaymentScheduleView({
      scheduleId: 1,
      quotationId: 9,
      // DPP 100jt + PPN 11jt = grandTotal 111jt; termin 50% -> 55,5jt.
      // Target 50jt (basis DPP) = MERAH per vonis.
      quotationGrandTotal: 111_000_000,
      terms: [
        term({ id: 1, cumulativePercent: 50 }),
        term({ id: 2, name: "Pelunasan", cumulativePercent: 100, sortOrder: 1 }),
      ],
      invoices: [],
      now: NOW,
    })
    expect(view.terms[0].targetAmount).toBe(55_500_000)
    expect(view.terms[1].targetAmount).toBe(111_000_000)
  })

  it("pembulatan: grandTotal Rp1 persen 33/33/34 -> Σ target persis Rp1 (BOT 6 butir 6)", () => {
    const view = buildJobPaymentScheduleView({
      scheduleId: 1,
      quotationId: 9,
      quotationGrandTotal: 1,
      terms: [
        term({ id: 1, cumulativePercent: 33 }),
        term({ id: 2, name: "T2", cumulativePercent: 66, sortOrder: 1 }),
        term({ id: 3, name: "T3", cumulativePercent: 100, sortOrder: 2 }),
      ],
      invoices: [],
      now: NOW,
    })
    expect(view.terms.map((t) => t.targetAmount)).toEqual([0.33, 0.66, 1])
    expect(view.terms.reduce((s, t) => s + t.termAmount, 0)).toBeCloseTo(1, 10)
    expect(view.terms[2].targetAmount).toBe(1)
  })

  it("DP bukan ukuran: tanpa invoice, termin tetap belum terpenuhi walau dueDate lampau -> jatuh_tempo", () => {
    const view = buildJobPaymentScheduleView({
      scheduleId: 1,
      quotationId: 9,
      quotationGrandTotal: 100_000_000,
      terms: threeTerms(),
      invoices: [],
      now: NOW,
    })
    // dueDate termin 1 = 1 Okt (lampau), tertagih 0 -> jatuh_tempo.
    expect(view.terms[0].status).toBe("jatuh_tempo")
    expect(view.terms[0].statusLabel).toBe("Jatuh Tempo")
    expect(view.terms[1].status).toBe("belum_jatuh_tempo")
    expect(view.nextTermId).toBe(1)
    expect(view.allFulfilled).toBe(false)
  })

  it("invoice cancelled tidak dihitung; draft ikut memesan porsi", () => {
    const view = buildJobPaymentScheduleView({
      scheduleId: 1,
      quotationId: 9,
      quotationGrandTotal: 100_000_000,
      terms: threeTerms(),
      invoices: [
        { id: 1, status: "cancelled", grandTotal: 30_000_000 },
        { id: 2, status: "draft", grandTotal: 30_000_000 },
      ],
      now: NOW,
    })
    expect(view.billedAmount).toBe(30_000_000)
    expect(view.terms[0].status).toBe("terpenuhi")
    expect(view.terms[0].statusLabel).toBe(JOB_PAYMENT_TERM_STATUS_LABELS.terpenuhi)
    expect(view.nextTermId).toBe(2)
  })

  it("terpenuhi sebagian: tertagih di antara dua target kumulatif", () => {
    const view = buildJobPaymentScheduleView({
      scheduleId: 1,
      quotationId: 9,
      quotationGrandTotal: 100_000_000,
      terms: threeTerms(),
      invoices: [{ id: 1, status: "posted", grandTotal: 50_000_000 }],
      now: NOW,
    })
    expect(view.terms[0].status).toBe("terpenuhi")
    expect(view.terms[1].status).toBe("terpenuhi_sebagian")
    expect(view.terms[1].statusLabel).toBe("Terpenuhi Sebagian")
    expect(view.terms[2].status).toBe("belum_jatuh_tempo")
    expect(view.nextTermId).toBe(2)
  })

  it("CO naik: termin terpenuhi tidak ditagih ulang, sisa dihitung dari grandTotal baru (BOT 6 butir 4)", () => {
    const view = buildJobPaymentScheduleView({
      scheduleId: 1,
      quotationId: 9,
      quotationGrandTotal: 120_000_000,
      terms: [
        term({ id: 1, cumulativePercent: 50 }),
        term({ id: 2, name: "Pelunasan", cumulativePercent: 100, sortOrder: 1 }),
      ],
      // Tertagih 50jt saat grandTotal masih 100jt (termin 1 50% terpenuhi).
      invoices: [{ id: 1, status: "posted", grandTotal: 50_000_000 }],
      now: NOW,
    })
    expect(view.terms[0].targetAmount).toBe(60_000_000)
    expect(view.terms[0].status).toBe("terpenuhi_sebagian")
    expect(view.terms[1].targetAmount).toBe(120_000_000)
    expect(view.nextTermId).toBe(1)
  })

  it("CO turun: tertagih melebihi grandTotal baru -> semua terpenuhi, builder tidak melahirkan kredit (butir 5 sisi baca)", () => {
    const view = buildJobPaymentScheduleView({
      scheduleId: 1,
      quotationId: 9,
      quotationGrandTotal: 80_000_000,
      terms: [
        term({ id: 1, cumulativePercent: 50 }),
        term({ id: 2, name: "Pelunasan", cumulativePercent: 100, sortOrder: 1 }),
      ],
      invoices: [{ id: 1, status: "posted", grandTotal: 90_000_000 }],
      now: NOW,
    })
    expect(view.allFulfilled).toBe(true)
    expect(view.nextTermId).toBeNull()
    expect(view.billedAmount).toBe(90_000_000)
  })

  it("kata status persis empat label Indonesia", () => {
    expect(JOB_PAYMENT_TERM_STATUS_LABELS).toEqual({
      belum_jatuh_tempo: "Belum Jatuh Tempo",
      jatuh_tempo: "Jatuh Tempo",
      terpenuhi_sebagian: "Terpenuhi Sebagian",
      terpenuhi: "Terpenuhi",
    })
  })
})

describe("validateJobPaymentTerms", () => {
  it("persen tidak naik ketat ditolak menyebut terminnya", () => {
    expect(
      validateJobPaymentTerms([
        { name: "A", cumulativePercent: 30 },
        { name: "B", cumulativePercent: 30 },
        { name: "C", cumulativePercent: 100 },
      ]),
    ).toContain("naik ketat")
  })

  it("baris terakhir bukan 100 ditolak", () => {
    expect(
      validateJobPaymentTerms([
        { name: "A", cumulativePercent: 30 },
        { name: "B", cumulativePercent: 90 },
      ]),
    ).toContain("persis 100")
  })

  it("nama kosong dan jadwal kosong ditolak", () => {
    expect(validateJobPaymentTerms([{ name: " ", cumulativePercent: 100 }])).toContain("nama termin wajib")
    expect(validateJobPaymentTerms([])).toContain("minimal satu baris")
  })

  it("daftar sah -> null", () => {
    expect(
      validateJobPaymentTerms([
        { name: "DP", cumulativePercent: 30 },
        { name: "Pelunasan", cumulativePercent: 100 },
      ]),
    ).toBeNull()
  })
})

import { describe, expect, it } from "vitest"

import {
  addCalendarMonthsWib,
  addCalendarYearsWib,
  deriveProbationStatus,
  evaluateContractApprovalSod,
  evaluateDecideProbation,
  evaluateExtendProbation,
  evaluateOpenProbation,
  evaluatePkwtCumulative,
  evaluateSubmitProbationReview,
  inclusiveDaySpanWib,
  pkwtCumulativeDays,
  probationMilestoneSlots,
} from "@/lib/reports/probation"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe("probationMilestoneSlots (Q-PROB-1/3)", () => {
  it("AC-PROB-1: durasi penuh 3 bulan -> titik 30/60/90, final=90", () => {
    const slots = probationMilestoneSlots(d("2026-01-05"), d("2026-04-05"))
    expect(slots.map((s) => [s.milestone, s.isFinal])).toEqual([
      ["30", false],
      ["60", false],
      ["90", true],
    ])
    expect(slots[0].dueDate).toEqual(d("2026-02-04"))
    expect(slots[2].dueDate).toEqual(d("2026-04-05"))
  })

  it("durasi <90 hari -> final di probationEndDate, 30/60 yang <= akhir tetap ada", () => {
    const slots = probationMilestoneSlots(d("2026-01-05"), d("2026-03-01"))
    expect(slots.map((s) => s.milestone)).toEqual(["30", "final"])
    expect(slots[1].dueDate).toEqual(d("2026-03-01"))
    expect(slots[1].isFinal).toBe(true)
  })

  it("aritmetika bulan kalender WIB: 31 Jan + 3 bulan = 30 Apr", () => {
    expect(addCalendarMonthsWib(d("2026-01-31"), 3)).toEqual(d("2026-04-30"))
    expect(addCalendarYearsWib(d("2021-03-01"), 5)).toEqual(d("2026-03-01"))
  })
})

describe("evaluateOpenProbation (BR-PROB-02/04)", () => {
  it("AC-PROB-1: PKWTT akhir = mulai+3 bulan lolos", () => {
    expect(
      evaluateOpenProbation({
        employmentStatus: "PKWTT",
        joinDate: d("2026-01-05"),
        probationEndDate: d("2026-04-05"),
      }),
    ).toEqual({ allowed: true })
  })

  it("AC-PROB-1 falsifikasi: akhir +4 bulan ditolak", () => {
    const r = evaluateOpenProbation({
      employmentStatus: "PKWTT",
      joinDate: d("2026-01-05"),
      probationEndDate: d("2026-05-05"),
    })
    expect(r.allowed).toBe(false)
  })

  it.each(["PKWT", "DAILY", "INTERN", null])("AC-PROB-2: status %s ditolak", (status) => {
    const r = evaluateOpenProbation({
      employmentStatus: status,
      joinDate: d("2026-01-05"),
      probationEndDate: d("2026-03-05"),
    })
    expect(r.allowed).toBe(false)
  })

  it("akhir sebelum mulai ditolak", () => {
    expect(
      evaluateOpenProbation({
        employmentStatus: "PKWTT",
        joinDate: d("2026-01-05"),
        probationEndDate: d("2026-01-04"),
      }).allowed,
    ).toBe(false)
  })

  it("F-6: akhir == mulai (durasi 0) ditolak", () => {
    expect(
      evaluateOpenProbation({
        employmentStatus: "PKWTT",
        joinDate: d("2026-01-05"),
        probationEndDate: d("2026-01-05"),
      }).allowed,
    ).toBe(false)
  })
})

describe("evaluateExtendProbation (BR-PROB-04)", () => {
  it("total tepat 3 bulan lolos; +1 hari ditolak", () => {
    expect(evaluateExtendProbation({ joinDate: d("2026-01-05"), newProbationEndDate: d("2026-04-05") })).toEqual({
      allowed: true,
    })
    expect(evaluateExtendProbation({ joinDate: d("2026-01-05"), newProbationEndDate: d("2026-04-06") }).allowed).toBe(
      false,
    )
  })
})

describe("evaluateSubmitProbationReview (Q-PROB-3)", () => {
  const base = {
    dueDate: d("2026-02-04"),
    today: d("2026-02-04"),
    technicalScore: "baik",
    disciplineScore: "cukup",
    attendanceScore: "baik",
    notes: null as string | null,
    recommendation: "lanjut",
  }

  it("jendela [dueDate, +7 hari] lolos; hari ke-8 dan sebelum due ditolak", () => {
    expect(evaluateSubmitProbationReview({ ...base, today: d("2026-02-11") })).toEqual({ allowed: true })
    expect(evaluateSubmitProbationReview({ ...base, today: d("2026-02-12") }).allowed).toBe(false)
    expect(evaluateSubmitProbationReview({ ...base, today: d("2026-02-03") }).allowed).toBe(false)
  })

  it("AC-PROB-3: rekomendasi tidak lulus tanpa catatan ditolak", () => {
    expect(evaluateSubmitProbationReview({ ...base, recommendation: "tidak_lulus_diusulkan" }).allowed).toBe(false)
    expect(
      evaluateSubmitProbationReview({ ...base, recommendation: "tidak_lulus_diusulkan", notes: "Rework berulang" }),
    ).toEqual({ allowed: true })
  })

  it("ada sumbu perlu_perhatian tanpa catatan ditolak walau rekomendasi lanjut", () => {
    expect(evaluateSubmitProbationReview({ ...base, disciplineScore: "perlu_perhatian" }).allowed).toBe(false)
  })

  it("skor angka / kategori karangan ditolak (BR-PROB-05 tanpa angka)", () => {
    expect(evaluateSubmitProbationReview({ ...base, technicalScore: "5" }).allowed).toBe(false)
    expect(evaluateSubmitProbationReview({ ...base, technicalScore: null }).allowed).toBe(false)
    expect(evaluateSubmitProbationReview({ ...base, recommendation: "lulus" }).allowed).toBe(false)
  })
})

describe("evaluateDecideProbation (BR-PROB-07)", () => {
  it("AC-PROB-4: tanpa review final submitted ditolak", () => {
    expect(evaluateDecideProbation({ finalReviewStatus: null, decision: "passed" }).allowed).toBe(false)
    expect(evaluateDecideProbation({ finalReviewStatus: "draft", decision: "passed" }).allowed).toBe(false)
    expect(evaluateDecideProbation({ finalReviewStatus: "submitted", decision: "passed" })).toEqual({ allowed: true })
    expect(evaluateDecideProbation({ finalReviewStatus: "submitted", decision: "bebas" }).allowed).toBe(false)
  })
})

describe("evaluateContractApprovalSod (BR-PROB-09 + SoD penuh)", () => {
  it("self-approve ditolak; penyetuju = penilai final ditolak; pihak ketiga lolos", () => {
    expect(
      evaluateContractApprovalSod({ approverEmployeeId: 7, requestedByEmployeeId: 7, finalReviewerEmployeeId: 9 })
        .allowed,
    ).toBe(false)
    expect(
      evaluateContractApprovalSod({ approverEmployeeId: 9, requestedByEmployeeId: 7, finalReviewerEmployeeId: 9 })
        .allowed,
    ).toBe(false)
    expect(
      evaluateContractApprovalSod({ approverEmployeeId: 11, requestedByEmployeeId: 7, finalReviewerEmployeeId: 9 }),
    ).toEqual({ allowed: true })
  })
})

describe("evaluatePkwtCumulative (BR-PROB-08/Q-PROB-6)", () => {
  it("AC-PROB-6: tepat 5 tahun lolos; +1 hari ditolak", () => {
    const base = {
      kind: "extend_pkwt" as const,
      appliedSegments: [{ start: d("2021-03-01"), end: d("2023-02-28") }],
      currentStart: d("2023-03-01"),
      currentEnd: d("2025-02-28"),
    }
    expect(evaluatePkwtCumulative({ ...base, proposedEnd: d("2026-03-01") })).toEqual({ allowed: true })
    expect(evaluatePkwtCumulative({ ...base, proposedEnd: d("2026-03-02") }).allowed).toBe(false)
  })

  it("contractStartDate null = fail-closed, pesan minta lengkapi master", () => {
    const r = evaluatePkwtCumulative({
      kind: "extend_pkwt",
      appliedSegments: [],
      currentStart: null,
      currentEnd: null,
      proposedEnd: d("2027-01-01"),
    })
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.message).toMatch(/lengkapi data karyawan/i)
  })

  it("kind bukan extend tidak dibatasi penjaga ini", () => {
    expect(
      evaluatePkwtCumulative({
        kind: "convert_pkwtt",
        appliedSegments: [],
        currentStart: null,
        currentEnd: null,
        proposedEnd: null,
      }),
    ).toEqual({ allowed: true })
  })

  it("satu definisi inklusif: segmen 1 Mar..28 Feb dua tahun penuh", () => {
    expect(inclusiveDaySpanWib(d("2023-03-01"), d("2023-03-01"))).toBe(1)
    expect(
      pkwtCumulativeDays({
        appliedSegments: [{ start: d("2021-03-01"), end: d("2023-02-28") }],
        currentStart: d("2023-03-01"),
        currentEnd: d("2025-02-28"),
        proposedEnd: null,
      }),
    ).toBe(inclusiveDaySpanWib(d("2021-03-01"), d("2023-02-28")) + inclusiveDaySpanWib(d("2023-03-01"), d("2025-02-28")))
  })
})

describe("deriveProbationStatus (turunan, BR-PROB-06)", () => {
  const base = {
    employmentStatus: "PKWTT",
    joinDate: d("2026-01-05"),
    probationEndDate: d("2026-04-05"),
    finalDecision: null,
    finalReviewSubmitted: false,
  } as const

  it("AC-PROB-5: lewat akhir tanpa keputusan = overdue_undecided, BUKAN passed", () => {
    expect(deriveProbationStatus({ ...base }, d("2026-04-06"))).toBe("overdue_undecided")
  })

  it("final submitted = awaiting_decision; decided memetakan keputusan", () => {
    expect(deriveProbationStatus({ ...base, finalReviewSubmitted: true }, d("2026-04-01"))).toBe("awaiting_decision")
    expect(deriveProbationStatus({ ...base, finalDecision: "passed", finalReviewSubmitted: true }, d("2026-04-01"))).toBe("passed")
    expect(deriveProbationStatus({ ...base, finalDecision: "failed", finalReviewSubmitted: true }, d("2026-04-01"))).toBe("failed")
  })

  it("tanpa probationEndDate = not_in_probation", () => {
    expect(deriveProbationStatus({ ...base, probationEndDate: null }, d("2026-04-01"))).toBe("not_in_probation")
  })
})
